import { dayIndex, dayStartTick, tickToDateTime } from '@app/clock/domain/calendar-logic';

import { weekStartDay } from './candle-window';
import { Candle } from './models/candle.model';

/** Game years of stored daily candles; older ones are consolidated to weekly candles (TS §6.8). */
export const DAILY_CANDLE_YEARS = 20;

/**
 * Newest calendar year whose daily candles are consolidated on `day`: every day of it lies more
 * than `dailyYears` game years back, i.e. the year is at most the current year − `dailyYears` − 1.
 */
export function newestConsolidatedYear(day: number, dailyYears = DAILY_CANDLE_YEARS): number {
  return tickToDateTime(dayStartTick(day)).year - dailyYears - 1;
}

/**
 * Week parts of daily candles in ascending order (TS §6.8): the candles of the same week (from
 * Monday) and the same calendar year merged – open of the first, highest high, lowest low, close of
 * the last – at the tick of the first. A week across the turn of the year gives two parts, so a
 * year is consolidated on its own; `weeklyCandles` merges the parts again.
 */
export function weekParts(daily: readonly Candle[]): Candle[] {
  const parts: Candle[] = [];
  let currentWeek = Number.NaN;
  let currentYear = Number.NaN;
  for (const candle of daily) {
    const day = dayIndex(candle.tick);
    const week = weekStartDay(day);
    const year = tickToDateTime(candle.tick).year;
    const last = parts[parts.length - 1];
    if (week !== currentWeek || year !== currentYear || last === undefined) {
      parts.push({ ...candle });
      currentWeek = week;
      currentYear = year;
      continue;
    }
    last.high = Math.max(last.high, candle.high);
    last.low = Math.min(last.low, candle.low);
    last.close = candle.close;
  }
  return parts;
}
