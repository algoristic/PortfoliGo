import { CalendarDate } from '@app/clock/domain/models/time.model';
import { Cents } from '@app/shared/domain/models/money.model';

import { AccountId, DepotId } from './account.model';

export type CalendarMonth = Pick<CalendarDate, 'year' | 'month'>;

/**
 * Steps of the bank run at 06:00 in booking order (TS §3.8, §7.4): the limits first, so that the
 * debits of the new month meet the new limits; then credits before debits; the standing orders
 * last, so that they see every credit and debit of the bank (AP 5.6a).
 */
export const BANK_RUN_STEPS = [
  'overdraft-limits',
  'salary',
  'credit-interest',
  'living-costs',
  'account-fee',
  'custody-fee',
  'overdraft-interest',
  'debit-interest',
  'standing-orders',
] as const;
export type BankRunStep = (typeof BANK_RUN_STEPS)[number];

export interface BankRunPlan {
  /** Steps due on the day in booking order; empty on days without a bank run. */
  steps: BankRunStep[];
  /** Month of the day: salary and living costs. */
  month: CalendarMonth;
  /** Previous month: account fees and interest settle it. */
  settledMonth: CalendarMonth;
  /** Savings accounts with quarterly payout are paid as well (first bank working day of a quarter). */
  quarterlyPayout: boolean;
}

/**
 * External deposits of a current account (TS §7.4): all of them for the fee waiver, the salary
 * for the overdraft limit. The engine keeps one entry per current account.
 */
export interface AccountInflows {
  accountId: AccountId;
  /** Salary of the last three full calendar months, oldest first. */
  salaryWindow: readonly [Cents, Cents, Cents];
  salaryThisMonth: Cents;
  /** External deposits (salary, opening balance) of the previous month, for its fee. */
  depositsLastMonth: Cents;
  depositsThisMonth: Cents;
}

export interface OverdraftLimit {
  accountId: AccountId;
  limit: Cents;
}

export interface AccountFeeCharge {
  month: CalendarMonth;
  amount: Cents;
}

export const ACCOUNT_EVENT_CODES = ['account-uncovered', 'overdraft-limit-exceeded'] as const;
export type AccountEventCode = (typeof ACCOUNT_EVENT_CODES)[number];

/** Balance and limit of an account; `limit` is `null` for accounts without overdraft facility. */
export interface CoverageState {
  balance: Cents;
  limit: Cents | null;
}

/**
 * Household flows of a month (US-EK-03, TS §7.4). Expenses are positive amounts; `taxes` is
 * withheld minus refunded and may be negative.
 */
export interface MonthlyValues {
  income: Cents;
  livingCosts: Cents;
  fees: Cents;
  creditInterest: Cents;
  /** Overdraft interest on current accounts and debit interest on clearing accounts. */
  debitInterest: Cents;
  taxes: Cents;
  /** Dividends and fund distributions before tax; 0 until AP 5.2. */
  dividends: Cents;
}

/** Household flows of a closed month (TS §7.4), oldest first in the player state. */
export interface ClosedMonth {
  month: CalendarMonth;
  values: MonthlyValues;
}

/**
 * Interest accrued on an account (TS §7.3, §7.4) in unrounded cents: credit ≥ 0, debit ≤ 0. The
 * running month accrues day by day; the month end adds it to the pending amounts, which the bank
 * run books when it settles the period (monthly, or quarterly for some savings accounts). The days
 * of a new month before its bank run stay in the running amounts.
 */
export interface InterestAccrual {
  accountId: AccountId;
  credit: number;
  debit: number;
  pendingCredit: number;
  pendingDebit: number;
}

/**
 * Depot values for the custody fee (TS §7.3, §7.4): the sum of the end-of-day values and the
 * number of calendar days the depot was open, for the running quarter and for the past quarter
 * until the bank run of the quarter's first bank working day charges it.
 */
export interface CustodyAccrual {
  depotId: DepotId;
  valueSum: Cents;
  days: number;
  pendingValueSum: Cents;
  pendingDays: number;
}

/** The custody fee of a quarter or a part of it (TS §7.3). */
export interface CustodyFeeCharge {
  /** First and last month of the quarter. */
  from: CalendarMonth;
  to: CalendarMonth;
  /** Calendar days the depot was open in it, and their average end-of-day value. */
  days: number;
  averageValue: Cents;
  amount: Cents;
}
