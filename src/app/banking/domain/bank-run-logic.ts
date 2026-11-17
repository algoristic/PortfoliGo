import {
  firstBankWorkingDay,
  lastBankWorkingDay,
  startOfDay,
} from '@app/clock/domain/calendar-logic';
import { Tick, TICKS_PER_DAY } from '@app/clock/domain/models/time.model';

import { BANK_RUN_TIME_OF_DAY, monthOf, previousMonth } from './calendar-month-logic';
import { InterestPayout } from './models/bank-conditions.model';
import { BANK_RUN_STEPS, BankRunPlan, CalendarMonth } from './models/household.model';
import { StandingOrder } from './models/standing-order.model';
import { dueMonth } from './standing-order-logic';

export {
  BANK_RUN_TIME_OF_DAY,
  monthKey,
  monthOf,
  nextMonth,
  previousMonth,
} from './calendar-month-logic';

/** What the bank run needs to know of a standing order to tell whether it is due. */
export type StandingOrderSchedule = Pick<StandingOrder, 'day' | 'paused' | 'handledUpTo'>;

const MONTHS_PER_QUARTER = 3;

/**
 * Whether savings interest with this payout is credited on the first bank working day of
 * `month`: monthly always, quarterly in January, April, July and October (for the past quarter).
 */
export function isInterestPayoutDue(payout: InterestPayout, month: CalendarMonth): boolean {
  return payout === 'monthly' || startsQuarter(month);
}

/**
 * What the bank run of the tick's day books (TS §7.4, E-19): the salary on the last bank working
 * day of the month; limits, credit interest, living costs, account fees and debit interest on the
 * first, and in January, April, July and October the custody fee of the past quarter; last, the
 * standing orders due that day (AP 5.6a). The plan depends only on the day, not on the time of
 * `tick`.
 */
export function bankRunPlan(
  tick: Tick,
  standingOrders: readonly StandingOrderSchedule[] = [],
): BankRunPlan {
  const month = monthOf(tick);
  const dayStart = startOfDay(tick);
  const isFirst = dayStart === firstBankWorkingDay(month.year, month.month);
  const isLast = dayStart === lastBankWorkingDay(month.year, month.month);
  const quarterly = isFirst && startsQuarter(month);
  return {
    steps: BANK_RUN_STEPS.filter((step) => {
      switch (step) {
        case 'salary':
          return isLast;
        case 'custody-fee':
          return quarterly;
        case 'standing-orders':
          return standingOrders.some((order) => dueMonth(order, tick) !== null);
        default:
          return isFirst;
      }
    }),
    month,
    settledMonth: previousMonth(month),
    quarterlyPayout: quarterly,
  };
}

/**
 * The first tick at or after `tick` with a bank run that has steps (06:00 of that day), standing
 * orders included.
 */
export function nextBankRunTick(
  tick: Tick,
  standingOrders: readonly StandingOrderSchedule[] = [],
): Tick {
  let runTick = startOfDay(tick) + BANK_RUN_TIME_OF_DAY;
  while (runTick < tick || bankRunPlan(runTick, standingOrders).steps.length === 0) {
    runTick += TICKS_PER_DAY;
  }
  return runTick;
}

/**
 * Months of the interest a closing account still accrues at `tick` (TS §7.4, AP 7.3b): `from` is
 * the first month no interest payout has settled yet — the month of the last payout bank run at or
 * before `tick` (06:00 on the first bank working day of the month, of the quarter's first month for
 * quarterly payout), never before the month the account was opened; `to` is the month of the day
 * before `tick`, the last day that bears interest.
 */
export function openInterestPeriod(
  payout: InterestPayout,
  openedAt: Tick,
  tick: Tick,
): { from: CalendarMonth; to: CalendarMonth } {
  let start = monthOf(tick);
  while (payout === 'quarterly' && !startsQuarter(start)) {
    start = previousMonth(start);
  }
  const run = firstBankWorkingDay(start.year, start.month) + BANK_RUN_TIME_OF_DAY;
  if (tick < run) {
    start = previousMonth(start);
    while (payout === 'quarterly' && !startsQuarter(start)) {
      start = previousMonth(start);
    }
  }
  const opened = monthOf(openedAt);
  const from = monthIndex(opened) > monthIndex(start) ? opened : start;
  return { from, to: monthOf(startOfDay(tick) - 1) };
}

function monthIndex({ year, month }: CalendarMonth): number {
  return year * 12 + month;
}

/** Whether the month is the first of a quarter (January, April, July, October). */
export function startsQuarter({ month }: CalendarMonth): boolean {
  return (month - 1) % MONTHS_PER_QUARTER === 0;
}
