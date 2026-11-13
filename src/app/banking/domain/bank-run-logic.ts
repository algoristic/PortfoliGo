import {
  firstBankWorkingDay,
  lastBankWorkingDay,
  startOfDay,
  tickToDateTime,
} from '@app/clock/domain/calendar-logic';
import { Tick, TICKS_PER_DAY, TICKS_PER_HOUR } from '@app/clock/domain/models/time.model';

import { InterestPayout } from './models/bank-conditions.model';
import { BANK_RUN_STEPS, BankRunPlan, CalendarMonth } from './models/household.model';

/** The bank run starts at 06:00 game time (E-19). */
export const BANK_RUN_TIME_OF_DAY: Tick = 6 * TICKS_PER_HOUR;

const MONTHS_PER_QUARTER = 3;

export function monthOf(tick: Tick): CalendarMonth {
  const { year, month } = tickToDateTime(tick);
  return { year, month };
}

export function previousMonth({ year, month }: CalendarMonth): CalendarMonth {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** `2030-04`: the month in stream keys (`life/living-costs/2030-04`) and as a map key. */
export function monthKey({ year, month }: CalendarMonth): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

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
 * first, and in January, April, July and October the custody fee of the past quarter. The plan depends only on the day, not on the time of `tick`.
 */
export function bankRunPlan(tick: Tick): BankRunPlan {
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
        default:
          return isFirst;
      }
    }),
    month,
    settledMonth: previousMonth(month),
    quarterlyPayout: quarterly,
  };
}

/** The first tick at or after `tick` with a bank run that has steps (06:00 of that day). */
export function nextBankRunTick(tick: Tick): Tick {
  let runTick = startOfDay(tick) + BANK_RUN_TIME_OF_DAY;
  while (runTick < tick || bankRunPlan(runTick).steps.length === 0) {
    runTick += TICKS_PER_DAY;
  }
  return runTick;
}

/** Whether the month is the first of a quarter (January, April, July, October). */
export function startsQuarter({ month }: CalendarMonth): boolean {
  return (month - 1) % MONTHS_PER_QUARTER === 0;
}
