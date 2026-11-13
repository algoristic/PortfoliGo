import { AccountKind } from '@app/banking/domain/models/account.model';
import { AccountView } from '@app/engine/domain/models/account-view.model';
import { Cents } from '@app/shared/domain/models/money.model';
import { Bank } from '@app/world/domain/models/bank.model';

/** The bank commands of the slice (TS §8.2); each has its own pending count. */
export const BANK_COMMANDS = [
  'openAccount',
  'closeAccount',
  'setSalaryAccount',
  'transfer',
] as const;
export type BankCommand = (typeof BANK_COMMANDS)[number];

/** Commands sent to the engine and not yet answered, per command. */
export type PendingBankCommands = Record<BankCommand, number>;

/** An account with its bank (name, type, conditions); `null` until the banks are loaded. */
export interface AccountEntry extends AccountView {
  bank: Bank | null;
}

/** Balances of the open accounts per kind and in total. */
export interface AccountTotals {
  byKind: Record<AccountKind, Cents>;
  total: Cents;
}
