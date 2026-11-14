import { Cents } from '@app/shared/domain/models/money.model';

import { TextParams, TransactionType } from './ledger.model';

/**
 * Why the engine rejects a bank command (TS §7.4, §8.2); the UI maps the codes to texts (TS §8.6).
 */
export const BANK_COMMAND_ERRORS = [
  /** The bank does not exist in the world. */
  'unknown-bank',
  /** The bank does not offer the account kind (brokers have no current or savings accounts). */
  'account-kind-not-offered',
  /** No account of the player has the ID. */
  'unknown-account',
  'account-closed',
  /** Only an open current account can become the salary account. */
  'not-a-current-account',
  /** The salary account closes only after another one was chosen. */
  'salary-account',
  /** The balance after the closing settlement is negative; it must be balanced first. */
  'negative-balance',
  /** The depot of a clearing account holds positions, open orders or savings plans (from M5). */
  'depot-not-empty',
  /** A balance remains after the closing settlement, but no target account was given. */
  'target-required',
  /** The target account is unknown, closed or the closing account itself. */
  'invalid-target',
  'same-account',
  /** The amount is not a positive whole number of cents. */
  'invalid-amount',
  /** The amount exceeds the available amount: balance plus free overdraft limit. */
  'insufficient-funds',
  /** The purpose has more than `MAX_PURPOSE_LENGTH` characters. */
  'purpose-too-long',
  /** The account is source or target of a standing order, paused ones included (AP 5.6a). */
  'standing-orders',
  /** The execution day of a standing order is no whole number from 1 to 28. */
  'invalid-day',
  /** No standing order of the player has the ID. */
  'unknown-standing-order',
] as const;
export type BankCommandError = (typeof BANK_COMMAND_ERRORS)[number];

/** Reasons that keep an account from closing; the closing preview lists all of them. */
export const CLOSING_BLOCKERS = [
  'salary-account',
  'depot-not-empty',
  'standing-orders',
  'negative-balance',
] as const satisfies readonly BankCommandError[];
export type ClosingBlocker = (typeof CLOSING_BLOCKERS)[number];

/** One booking of the closing settlement, with its amount on the closing account. */
export interface ClosingBooking {
  type: TransactionType;
  amount: Cents;
  params?: TextParams;
}

/** What closing an account now would book (TS §7.4, PS §10.1 „Kosten vor Aktion“). */
export interface ClosingPreview {
  /** Interest with its tax, the fees up to the closing day, then the debit interest. */
  bookings: ClosingBooking[];
  /** Balance after the settlement: transferred to the target account when positive. */
  remainder: Cents;
  /**
   * Dividends and fund distributions earned before and credited after now (TS §7.4): they go to
   * the target account on their payment date, so closing needs a target even without remainder.
   */
  pendingDistributions: Cents;
  blockers: ClosingBlocker[];
}
