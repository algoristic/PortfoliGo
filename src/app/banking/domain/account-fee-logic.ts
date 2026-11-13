import {
  dateTimeToTick,
  dayIndex,
  daysInMonth,
  firstBankWorkingDay,
} from '@app/clock/domain/calendar-logic';
import { Tick } from '@app/clock/domain/models/time.model';
import { Cents } from '@app/shared/domain/models/money.model';
import { roundHalfAwayFromZero } from '@app/shared/domain/money-logic';

import { BANK_RUN_TIME_OF_DAY, monthOf, previousMonth } from './bank-run-logic';
import { Account } from './models/account.model';
import { CurrentAccountConditions } from './models/bank-conditions.model';
import { AccountFeeCharge, AccountInflows, CalendarMonth } from './models/household.model';

type FeeConditions = Pick<CurrentAccountConditions, 'monthlyFee' | 'feeWaiver'>;
type AccountLifetime = Pick<Account, 'openedAt' | 'closedAt'>;
type MonthlyDeposits = Pick<AccountInflows, 'depositsLastMonth' | 'depositsThisMonth'>;

/**
 * Calendar days of `month` on which the account was open; the opening and the closing day both
 * count (TS §7.4).
 */
export function openDaysInMonth(account: AccountLifetime, month: CalendarMonth): number {
  const first = dayIndex(dateTimeToTick({ ...month, day: 1 }));
  const last = first + daysInMonth(month.year, month.month) - 1;
  const from = Math.max(first, dayIndex(account.openedAt));
  const to = Math.min(last, account.closedAt === null ? last : dayIndex(account.closedAt));
  return Math.max(0, to - from + 1);
}

/**
 * Account fee of a current account for one month (TS §7.4): waived when the external deposits of
 * the month reach `feeWaiver.minMonthlyDeposits` (also in a partial month), otherwise the monthly
 * fee pro rata by calendar days, rounded to cents.
 */
export function monthlyAccountFee(
  conditions: FeeConditions,
  account: AccountLifetime,
  month: CalendarMonth,
  externalDeposits: Cents,
): Cents {
  const waiver = conditions.feeWaiver;
  if (waiver !== undefined && externalDeposits >= waiver.minMonthlyDeposits) {
    return 0;
  }
  const days = openDaysInMonth(account, month);
  return roundHalfAwayFromZero(
    (conditions.monthlyFee * days) / daysInMonth(month.year, month.month),
  );
}

/**
 * Account fees still due when the account closes at `closeTick` (TS §7.4): the previous month if
 * the bank run of the closing month has not settled it yet, then the closing month pro rata up to
 * the closing day. Months without a fee are left out.
 */
export function closingAccountFees(
  conditions: FeeConditions,
  account: AccountLifetime,
  closeTick: Tick,
  deposits: MonthlyDeposits,
): AccountFeeCharge[] {
  const closed = { openedAt: account.openedAt, closedAt: closeTick };
  const month = monthOf(closeTick);
  const settled = closeTick >= firstBankWorkingDay(month.year, month.month) + BANK_RUN_TIME_OF_DAY;
  const last = previousMonth(month);
  const charges: AccountFeeCharge[] = [
    {
      month: last,
      amount: settled ? 0 : monthlyAccountFee(conditions, closed, last, deposits.depositsLastMonth),
    },
    { month, amount: monthlyAccountFee(conditions, closed, month, deposits.depositsThisMonth) },
  ];
  return charges.filter(({ amount }) => amount > 0);
}
