import { tickToDateTime } from '@app/clock/domain/calendar-logic';
import { Tick, TICKS_PER_HOUR } from '@app/clock/domain/models/time.model';

import { CalendarMonth } from './models/household.model';

// Months of the bank run and the time of day it runs; `bank-run-logic.ts` re-exports them, so that
// `standing-order-logic.ts` can use them without importing the bank run plan it feeds.

/** The bank run starts at 06:00 game time (E-19). */
export const BANK_RUN_TIME_OF_DAY: Tick = 6 * TICKS_PER_HOUR;

export function monthOf(tick: Tick): CalendarMonth {
  const { year, month } = tickToDateTime(tick);
  return { year, month };
}

export function previousMonth({ year, month }: CalendarMonth): CalendarMonth {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export function nextMonth({ year, month }: CalendarMonth): CalendarMonth {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** `2030-04`: the month in stream keys (`life/living-costs/2030-04`) and as a map key. */
export function monthKey({ year, month }: CalendarMonth): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}
