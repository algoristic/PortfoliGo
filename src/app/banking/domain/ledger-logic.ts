import { Cents } from '@app/shared/domain/models/money.model';

import { AccountId } from './models/account.model';
import {
  Balances,
  ExternalAccountId,
  LedgerAccountId,
  Posting,
  Transaction,
  TransactionDraft,
} from './models/ledger.model';

const EXTERNAL_PREFIX = 'external:';

export const OPENING_BALANCE_ACCOUNT: ExternalAccountId = 'external:opening-balance';
export const EMPLOYER_ACCOUNT: ExternalAccountId = 'external:employer';
export const LIVING_COSTS_ACCOUNT: ExternalAccountId = 'external:living-costs';
export const TAX_OFFICE_ACCOUNT: ExternalAccountId = 'external:tax-office';
export const MARKET_ACCOUNT: ExternalAccountId = 'external:market';

export function bankFeesAccount(bankId: string): ExternalAccountId {
  return `external:bank:${bankId}:fees`;
}

export function bankInterestAccount(bankId: string): ExternalAccountId {
  return `external:bank:${bankId}:interest`;
}

export function issuerAccount(issuerId: string): ExternalAccountId {
  return `external:issuer:${issuerId}`;
}

export function isPlayerAccount(account: LedgerAccountId): account is AccountId {
  return !account.startsWith(EXTERNAL_PREFIX);
}

/**
 * Checks a transaction (TS §7.2), applies it to the balances and returns it with its running
 * number and the balance after each posting on a player account. An invalid transaction is an
 * engine bug: it throws and leaves the balances unchanged. Invalid are fewer than two postings,
 * amounts that are not whole cents, unknown accounts, postings that don't sum to 0 and a balance
 * after a posting beyond the safe integers (`Number.isSafeInteger`, TS §7.1).
 */
export function bookTransaction(
  balances: Balances,
  seq: number,
  draft: TransactionDraft,
): Transaction {
  checkPostings(balances, draft);
  const after: Balances = new Map();
  const postings = draft.postings.map((posting): Posting => {
    if (!isPlayerAccount(posting.account)) {
      return { ...posting, balanceAfter: null };
    }
    const balanceAfter =
      (after.get(posting.account) ?? (balances.get(posting.account) as Cents)) + posting.amount;
    // Beyond 2^53 cents a balance is no longer exact (TS §7.1); only extreme profiles get there.
    if (!Number.isSafeInteger(balanceAfter)) {
      throw new RangeError(
        `bookTransaction: ${draft.type} leaves ${posting.account} at ${balanceAfter}`,
      );
    }
    after.set(posting.account, balanceAfter);
    return { ...posting, balanceAfter };
  });
  for (const [account, balance] of after) {
    balances.set(account, balance);
  }
  return { seq, ...draft, postings };
}

/** Balances of all player accounts in a journal, summed in journal order. */
export function journalBalances(journal: Iterable<Transaction>): Balances {
  const balances: Balances = new Map();
  for (const transaction of journal) {
    for (const { account, amount } of transaction.postings) {
      if (isPlayerAccount(account)) {
        balances.set(account, (balances.get(account) ?? 0) + amount);
      }
    }
  }
  return balances;
}

function checkPostings(balances: Balances, draft: TransactionDraft): void {
  const { postings } = draft;
  if (postings.length < 2) {
    throw new RangeError(`bookTransaction: ${draft.type} needs at least two postings`);
  }
  let sum = 0;
  for (const { account, amount } of postings) {
    if (!Number.isSafeInteger(amount)) {
      throw new RangeError(`bookTransaction: ${draft.type} books ${amount} on ${account}`);
    }
    if (isPlayerAccount(account) && !balances.has(account)) {
      throw new RangeError(`bookTransaction: ${draft.type} books on unknown account ${account}`);
    }
    sum += amount;
  }
  if (sum !== 0) {
    throw new RangeError(`bookTransaction: postings of ${draft.type} sum to ${sum}`);
  }
}
