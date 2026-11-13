import { Cents } from '@app/shared/domain/models/money.model';
import { roundHalfAwayFromZero } from '@app/shared/domain/money-logic';

import { CurrentAccountConditions, DepotConditions } from './models/bank-conditions.model';

/** act/365: also in leap years, so a full leap year earns 366/365 of the yearly rate (TS §7.3). */
export const INTEREST_DAYS_PER_YEAR = 365;

type OverdraftRates = Pick<CurrentAccountConditions['overdraft'], 'rate' | 'toleratedSurcharge'>;
type ClearingAccountRates = Pick<
  DepotConditions,
  'clearingAccountRate' | 'clearingAccountDebitRate'
>;

/**
 * Interest of one day in unrounded cents, with the sign of the balance: credit interest is
 * positive, debit interest negative. Callers sum the days and round with `bookedInterest`.
 */
export function dailyInterest(balance: Cents, rate: number): number {
  return (balance * rate) / INTEREST_DAYS_PER_YEAR;
}

/** Clearing accounts earn `clearingAccountRate` on credit and pay the debit rate below zero. */
export function clearingAccountDailyInterest(balance: Cents, rates: ClearingAccountRates): number {
  return dailyInterest(
    balance,
    balance < 0 ? rates.clearingAccountDebitRate : rates.clearingAccountRate,
  );
}

/**
 * Overdraft interest of one day on a current account (TS §7.3): the negative balance up to the
 * limit at `rate`, the part beyond it at `rate + toleratedSurcharge`. Credit earns nothing.
 */
export function overdraftDailyInterest(
  balance: Cents,
  limit: Cents,
  rates: OverdraftRates,
): number {
  if (balance >= 0) {
    return 0;
  }
  const withinLimit = Math.max(balance, -limit);
  const beyondLimit = balance - withinLimit;
  return (
    dailyInterest(withinLimit, rates.rate) +
    dailyInterest(beyondLimit, rates.rate + rates.toleratedSurcharge)
  );
}

/** Accrued interest rounded to cents when it is booked. */
export function bookedInterest(accrued: number): Cents {
  return roundHalfAwayFromZero(accrued);
}
