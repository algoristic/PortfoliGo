import { Tick } from '@app/clock/domain/models/time.model';

export const ACCOUNT_KINDS = ['current', 'savings', 'clearing'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

/** Player account IDs and depot IDs come from one counter per player (TS §7.2). */
export type AccountId = `acc-${number}`;
export type DepotId = `dep-${number}`;

interface AccountBase {
  id: AccountId;
  bankId: string;
  /** Ten-digit number that tells accounts of the same kind and bank apart in the UI. */
  number: string;
  openedAt: Tick;
  closedAt: Tick | null;
}

export interface CurrentAccount extends AccountBase {
  kind: 'current';
}

export interface SavingsAccount extends AccountBase {
  kind: 'savings';
}

export interface ClearingAccount extends AccountBase {
  kind: 'clearing';
  depotId: DepotId;
}

export type Account = CurrentAccount | SavingsAccount | ClearingAccount;

export interface Depot {
  id: DepotId;
  bankId: string;
  clearingAccountId: AccountId;
  number: string;
  openedAt: Tick;
  closedAt: Tick | null;
}

/** What a player can open (US-BK-02): a depot always comes with its clearing account. */
export const OPENABLE_ACCOUNT_KINDS = ['current', 'savings', 'depot'] as const;
export type OpenableAccountKind = (typeof OPENABLE_ACCOUNT_KINDS)[number];
