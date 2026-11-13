import { Tick } from '@app/clock/domain/models/time.model';
import { Cents, MicroUnits } from '@app/shared/domain/models/money.model';

import { AccountId, DepotId } from './account.model';

export const TRANSACTION_TYPES = [
  'opening-balance',
  'salary',
  'living-costs',
  'account-fee',
  'custody-fee',
  'overdraft-interest',
  'debit-interest',
  'credit-interest',
  'transfer',
  'buy',
  'sell',
  'dividend',
  'fund-distribution',
  'tax',
  'tax-refund',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/** Counterparties outside the player's books (TS §7.2). */
export type ExternalAccountId =
  | 'external:opening-balance'
  | 'external:employer'
  | 'external:living-costs'
  | 'external:tax-office'
  | 'external:market'
  | `external:bank:${string}:fees`
  | `external:bank:${string}:interest`
  | `external:issuer:${string}`;

export type LedgerAccountId = AccountId | ExternalAccountId;

export interface PostingDraft {
  account: LedgerAccountId;
  amount: Cents;
}

export interface Posting extends PostingDraft {
  /** Balance of the player account after this posting; `null` for external accounts. */
  balanceAfter: Cents | null;
}

export interface UnitPosting {
  depotId: DepotId;
  instrumentId: string;
  quantity: MicroUnits;
}

/** Codes and numbers only, never texts (TS §8.6); a transfer's purpose is user data. */
export type TextParams = Readonly<Record<string, string | number>>;

export interface TransactionDraft {
  tick: Tick;
  type: TransactionType;
  postings: readonly PostingDraft[];
  units?: readonly UnitPosting[];
  refs?: Readonly<Record<string, string>>;
  params?: TextParams;
}

export interface Transaction extends Omit<TransactionDraft, 'postings'> {
  /** Running number per player. */
  seq: number;
  postings: readonly Posting[];
}

/** Balances of the player accounts the engine keeps. */
export type Balances = Map<AccountId, Cents>;
