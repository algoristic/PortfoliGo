import { daysInMonth } from '@app/clock/domain/calendar-logic';
import { Cents } from '@app/shared/domain/models/money.model';
import { roundHalfAwayFromZero } from '@app/shared/domain/money-logic';

import { previousMonth, startsQuarter } from './bank-run-logic';
import { custodyFee } from './fee-logic';
import { CustodyFee } from './models/bank-conditions.model';
import { CalendarMonth, CustodyAccrual, CustodyFeeCharge } from './models/household.model';

const QUARTERS_PER_YEAR = 4;
const MONTHS_PER_QUARTER = 3;

/** First and last month of the quarter that contains `month`. */
export function quarterMonths(month: CalendarMonth): { from: CalendarMonth; to: CalendarMonth } {
  let from = month;
  while (!startsQuarter(from)) {
    from = previousMonth(from);
  }
  const last = from.month + MONTHS_PER_QUARTER - 1;
  return { from, to: { year: from.year, month: last } };
}

/** Calendar days of the quarter that contains `month` (90 to 92). */
export function daysInQuarter(month: CalendarMonth): number {
  const { from } = quarterMonths(month);
  let days = 0;
  for (let n = 0; n < MONTHS_PER_QUARTER; n++) {
    days += daysInMonth(from.year, from.month + n);
  }
  return days;
}

/** Average of `days` end-of-day values, rounded to cents half away from zero; 0 without days. */
export function averageDepotValue(valueSum: Cents, days: number): Cents {
  return days === 0 ? 0 : roundHalfAwayFromZero(valueSum / days);
}

/**
 * Custody fee of the days a depot was open in a quarter (TS §7.3): `custodyFee` on the average
 * end-of-day value of those days with the year share ¼ × days ÷ days of the quarter, i.e. pro rata
 * by calendar days like the account fee. A full quarter has the year share ¼. Without days, none.
 */
export function quarterCustodyFee(
  custody: CustodyFee,
  quarter: CalendarMonth,
  valueSum: Cents,
  days: number,
): CustodyFeeCharge {
  const averageValue = averageDepotValue(valueSum, days);
  const amount =
    days === 0
      ? 0
      : custodyFee(custody, averageValue, days / (QUARTERS_PER_YEAR * daysInQuarter(quarter)));
  return { ...quarterMonths(quarter), days, averageValue, amount };
}

/**
 * Custody fees still due when a depot closes in `month` (TS §7.3, §7.4): the past quarter while the
 * bank run has not charged it yet (pending days), then the running quarter up to and including the
 * closing day. The depot is empty when it closes, so the closing day adds a day with value 0.
 * Charges of 0 are left out.
 */
export function closingCustodyFees(
  custody: CustodyFee,
  accrual: Readonly<CustodyAccrual>,
  month: CalendarMonth,
): CustodyFeeCharge[] {
  const charges: CustodyFeeCharge[] = [];
  if (accrual.pendingDays > 0) {
    const past = previousMonth(quarterMonths(month).from);
    charges.push(quarterCustodyFee(custody, past, accrual.pendingValueSum, accrual.pendingDays));
  }
  charges.push(quarterCustodyFee(custody, month, accrual.valueSum, accrual.days + 1));
  return charges.filter(({ amount }) => amount > 0);
}

/** A new depot's accrual: nothing accrued yet. */
export function openCustodyAccrual(depotId: CustodyAccrual['depotId']): CustodyAccrual {
  return { depotId, valueSum: 0, days: 0, pendingValueSum: 0, pendingDays: 0 };
}

/** Adds the end-of-day value of one calendar day on which the depot was open. */
export function accrueCustodyDay(accrual: CustodyAccrual, value: Cents): void {
  accrual.valueSum += value;
  accrual.days++;
}

/**
 * At the start of a quarter (month end of March, June, September, December): the running quarter
 * waits for the bank run that charges it, the new quarter starts empty.
 */
export function closeCustodyQuarter(accrual: CustodyAccrual): void {
  accrual.pendingValueSum += accrual.valueSum;
  accrual.pendingDays += accrual.days;
  accrual.valueSum = 0;
  accrual.days = 0;
}
