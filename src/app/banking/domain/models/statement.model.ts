import { Tick } from '@app/clock/domain/models/time.model';
import { Cents } from '@app/shared/domain/models/money.model';

import { Account, AccountId, AccountKind } from './account.model';
import { ExternalAccountId, TextParams, TransactionType } from './ledger.model';

/** Largest page of a statement query (TS §8.2). */
export const MAX_STATEMENT_LIMIT = 200;

/**
 * Other side of a statement entry: an external account (a code the UI turns into a text, with the
 * bank for bank fees and interest) or one of the player's accounts.
 */
export type StatementCounterparty =
  | { kind: 'external'; account: ExternalAccountId; bankId: string | null }
  | {
      kind: 'own';
      accountId: AccountId;
      accountKind: AccountKind;
      bankId: string;
      number: string;
    };

/** A transaction as one account sees it (TS §7.2, US-BK-06); texts come from codes in the UI. */
export interface StatementEntry {
  seq: number;
  tick: Tick;
  type: TransactionType;
  /** Sum of the postings on this account. */
  amount: Cents;
  /** Balance of this account after the transaction. */
  balanceAfter: Cents;
  /** The other accounts of the transaction in posting order, each once. */
  counterparties: StatementCounterparty[];
  params: TextParams;
  refs: Readonly<Record<string, string>>;
}

/** Filters of a statement; ticks are inclusive, no `types` (or none) means all types. */
export interface StatementFilter {
  from?: Tick;
  to?: Tick;
  types?: readonly TransactionType[];
  /** Purpose, bank names, number of an own counter account, security name or amount (TS §7.2). */
  search?: string;
}

/**
 * What turns transactions into entries and what the search reads: accounts, bank names and the
 * names of the securities (`refs.instrumentId`; none without).
 */
export interface StatementContext {
  accountId: AccountId;
  /** All accounts of the player, closed ones included. */
  accounts: readonly Account[];
  bankNames: ReadonlyMap<string, string>;
  instrumentNames?: ReadonlyMap<string, string>;
}

export interface StatementPageRequest {
  offset: number;
  limit: number;
}

/** One page of the matches, newest first, and the number of all matches. */
export interface StatementPage {
  total: number;
  entries: StatementEntry[];
}

/** Periods of the statement filter (US-BK-06); the bounds follow from the game time. */
export const STATEMENT_PERIODS = [
  'all',
  'this-month',
  'last-month',
  'this-year',
  'last-year',
] as const;
export type StatementPeriod = (typeof STATEMENT_PERIODS)[number];

/** Inclusive tick bounds of a period; a missing bound is open. */
export interface StatementPeriodRange {
  from?: Tick;
  to?: Tick;
}
