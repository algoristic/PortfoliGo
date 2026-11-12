import { dayIndex, dayStartTick, weekdayOfDay } from '@app/clock/domain/calendar-logic';

import { MINUTES_PER_HOUR, TICKS_PER_MINUTE } from '@app/clock/domain/models/time.model';

import { createCurveTables, CurveTables, SupportValues } from './day-curve';
import { MarketContext } from './market-context';
import { Candle, IntradayResolution } from './models/candle.model';
import { MarketDay } from './models/market-day.model';
import { seriesCount } from './series';

const INTRADAY_MINUTES: Readonly<Record<IntradayResolution, number>> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '1h': MINUTES_PER_HOUR,
};

export function intradayMinutes(resolution: IntradayResolution): number {
  return INTRADAY_MINUTES[resolution];
}

/**
 * Intraday candles of one session from its minute curve (`curve[j]` = price at minute
 * `open + j`, the last value is the close). Periods are aligned to the minute of the day and cut
 * at the open and close. Only the values up to `lastIndex` are used, so a running session ends
 * with a partial candle whose close is the current price.
 */
export function intradayCandles(
  curve: ArrayLike<number>,
  day: number,
  open: number,
  resolution: IntradayResolution,
  lastIndex: number = curve.length - 1,
): Candle[] {
  const minutes = INTRADAY_MINUTES[resolution];
  const length = curve.length - 1;
  const dayStart = dayStartTick(day);
  const candles: Candle[] = [];
  let start = 0;
  while (start <= lastIndex && start < length) {
    const periodEnd = (Math.floor((open + start) / minutes) + 1) * minutes - open;
    const end = Math.min(periodEnd, length, lastIndex);
    candles.push({
      tick: dayStart + (open + start) * TICKS_PER_MINUTE,
      ...summarize(curve, start, end),
    });
    start = periodEnd;
  }
  return candles;
}

/** Daily candle from the minute curve, up to `lastIndex` (partial while the session runs). */
export function dailyCandle(
  curve: ArrayLike<number>,
  day: number,
  lastIndex: number = curve.length - 1,
): Candle {
  return { tick: dayStartTick(day), ...summarize(curve, 0, lastIndex) };
}

/**
 * Daily candles of all series (shares, indices, ETFs, see `series.ts`) right after a day step in
 * batch mode: open and close come from the support points, high and low stay `NaN` until the
 * background job completes them (TS §6.8). Contains the close, so it may only be released once
 * the day is over. Pass the tables when calling this for many days.
 */
export function dailyCandlesFromSupport(
  context: MarketContext,
  day: Readonly<MarketDay>,
  tables: CurveTables = createCurveTables(context),
): Candle[] {
  const tick = dayStartTick(day.day);
  const support = new SupportValues(tables, day);
  return Array.from({ length: seriesCount(context) }, (_value, series) => ({
    tick,
    open: support.value(series, 'open'),
    high: Number.NaN,
    low: Number.NaN,
    close: support.value(series, 'close'),
  }));
}

/** Weekly candles (week starts on Monday) from daily candles in ascending order. */
export function weeklyCandles(daily: readonly Candle[]): Candle[] {
  const weeks: Candle[] = [];
  let currentWeek = -1;
  for (const candle of daily) {
    const day = dayIndex(candle.tick);
    const week = day - weekdayOfDay(day);
    const last = weeks[weeks.length - 1];
    if (week !== currentWeek || last === undefined) {
      weeks.push({ ...candle, tick: dayStartTick(week) });
      currentWeek = week;
      continue;
    }
    last.high = Math.max(last.high, candle.high);
    last.low = Math.min(last.low, candle.low);
    last.close = candle.close;
  }
  return weeks;
}

function summarize(curve: ArrayLike<number>, from: number, to: number): Omit<Candle, 'tick'> {
  let high = curve[from];
  let low = curve[from];
  for (let j = from + 1; j <= to; j++) {
    high = Math.max(high, curve[j]);
    low = Math.min(low, curve[j]);
  }
  return { open: curve[from], high, low, close: curve[to] };
}
