import { Cents } from '@app/shared/domain/models/money.model';
import { parseAmountInput } from '@app/shared/util/amount-input';

import { isPlayerAccount } from './ledger-logic';
import { Account, AccountId } from './models/account.model';
import { Transaction } from './models/ledger.model';
import {
  StatementContext,
  StatementCounterparty,
  StatementEntry,
  StatementFilter,
  StatementPage,
  StatementPageRequest,
} from './models/statement.model';

const CENTS_PER_EURO = 100;
const EXTERNAL_BANK = /^external:bank:(.+):(?:fees|interest)$/;

/** A search text read once per query (TS §7.2, statement search). */
interface StatementSearch {
  /** Trimmed and lower case. */
  text: string;
  /** The text read as a German amount, or `null`. */
  amount: {
    /** Magnitude in cents. */
    cents: Cents;
    /** With a minus sign: debits only. */
    negative: boolean;
    /** With a comma: equal in cents; without: equal in whole euros. */
    exact: boolean;
  } | null;
}

/** `null` for an empty search. */
function prepareStatementSearch(search: string | undefined): StatementSearch | null {
  const text = (search ?? '').trim().toLowerCase();
  if (text === '') {
    return null;
  }
  const parsed = parseAmountInput(text);
  return {
    text,
    amount:
      parsed.kind === 'amount'
        ? { cents: Math.abs(parsed.cents), negative: parsed.cents < 0, exact: text.includes(',') }
        : null,
  };
}

/**
 * Transactions of several sources (stored, not yet stored) in journal order, each running number
 * once; a later source wins.
 */
export function mergeJournal(...sources: ReadonlyArray<readonly Transaction[]>): Transaction[] {
  const bySeq = new Map<number, Transaction>();
  for (const source of sources) {
    for (const transaction of source) {
      bySeq.set(transaction.seq, transaction);
    }
  }
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

/**
 * One page of an account's statement (TS §7.2, US-BK-06): the transactions of `journal` (in journal
 * order) that book on the account and match the filter, newest first, from `offset` on.
 */
export function statementPage(
  journal: readonly Transaction[],
  context: StatementContext,
  filter: StatementFilter,
  page: StatementPageRequest,
): StatementPage {
  const { accountId } = context;
  const accounts = new Map(context.accounts.map((account) => [account.id, account]));
  const bankNames = new Map(
    [...context.bankNames].map(([bankId, name]) => [bankId, name.toLowerCase()]),
  );
  const instrumentNames = context.instrumentNames ?? new Map<string, string>();
  const search = prepareStatementSearch(filter.search);
  const types =
    filter.types !== undefined && filter.types.length > 0 ? new Set(filter.types) : null;
  const from = filter.from ?? -Infinity;
  const to = filter.to ?? Infinity;
  const end = page.offset + page.limit;
  const entries: StatementEntry[] = [];
  let total = 0;
  for (let i = journal.length - 1; i >= 0; i--) {
    const transaction = journal[i];
    if (transaction.tick < from || transaction.tick > to) {
      continue;
    }
    if (types !== null && !types.has(transaction.type)) {
      continue;
    }
    const amount = amountOn(transaction, accountId);
    if (amount === null) {
      continue;
    }
    if (
      search !== null &&
      !matchesSearch(transaction, amount, search, accountId, accounts, bankNames, instrumentNames)
    ) {
      continue;
    }
    if (total >= page.offset && total < end) {
      entries.push(toEntry(transaction, accountId, amount, accounts));
    }
    total++;
  }
  return { total, entries };
}

/**
 * Whether a booked amount matches an amount search: the magnitude in cents (with a comma) or in
 * whole euros (without); with a minus sign only debits.
 */
function matchesAmount(amount: Cents, search: NonNullable<StatementSearch['amount']>): boolean {
  if (search.negative && amount >= 0) {
    return false;
  }
  const magnitude = Math.abs(amount);
  return search.exact
    ? magnitude === search.cents
    : magnitude - (magnitude % CENTS_PER_EURO) === search.cents;
}

function amountOn(transaction: Transaction, accountId: AccountId): Cents | null {
  let amount: Cents | null = null;
  for (const posting of transaction.postings) {
    if (posting.account === accountId) {
      amount = (amount ?? 0) + posting.amount;
    }
  }
  return amount;
}

function toEntry(
  transaction: Transaction,
  accountId: AccountId,
  amount: Cents,
  accounts: ReadonlyMap<string, Account>,
): StatementEntry {
  let balanceAfter: Cents = 0;
  for (const posting of transaction.postings) {
    if (posting.account === accountId) {
      balanceAfter = posting.balanceAfter as Cents;
    }
  }
  return {
    seq: transaction.seq,
    tick: transaction.tick,
    type: transaction.type,
    amount,
    balanceAfter,
    counterparties: counterparties(transaction, accountId, accounts),
    params: { ...transaction.params },
    refs: { ...transaction.refs },
  };
}

function counterparties(
  transaction: Transaction,
  accountId: AccountId,
  accounts: ReadonlyMap<string, Account>,
): StatementCounterparty[] {
  const seen = new Set<string>([accountId]);
  const result: StatementCounterparty[] = [];
  for (const { account } of transaction.postings) {
    if (seen.has(account)) {
      continue;
    }
    seen.add(account);
    if (isPlayerAccount(account)) {
      const own = accounts.get(account);
      if (own === undefined) {
        throw new RangeError(
          `statement: transaction ${transaction.seq} books on unknown ${account}`,
        );
      }
      result.push({
        kind: 'own',
        accountId: account,
        accountKind: own.kind,
        bankId: own.bankId,
        number: own.number,
      });
    } else {
      result.push({ kind: 'external', account, bankId: EXTERNAL_BANK.exec(account)?.[1] ?? null });
    }
  }
  return result;
}

/**
 * Purpose, the bank names and numbers of the other accounts, the name of the security
 * (case-insensitive substrings) or the amount (`matchesAmount`).
 */
function matchesSearch(
  transaction: Transaction,
  amount: Cents,
  search: StatementSearch,
  accountId: AccountId,
  accounts: ReadonlyMap<string, Account>,
  lowerBankNames: ReadonlyMap<string, string>,
  instrumentNames: ReadonlyMap<string, string>,
): boolean {
  if (search.amount !== null && matchesAmount(amount, search.amount)) {
    return true;
  }
  const purpose = transaction.params?.['purpose'];
  if (typeof purpose === 'string' && purpose.toLowerCase().includes(search.text)) {
    return true;
  }
  const instrumentId = transaction.refs?.['instrumentId'];
  const instrument = instrumentId === undefined ? undefined : instrumentNames.get(instrumentId);
  if (instrument !== undefined && instrument.toLowerCase().includes(search.text)) {
    return true;
  }
  return counterparties(transaction, accountId, accounts).some(
    (other) =>
      (other.kind === 'own' && other.number.includes(search.text)) ||
      (lowerBankNames.get(other.bankId ?? '')?.includes(search.text) ?? false),
  );
}
