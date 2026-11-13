import {
  dayIndex,
  dayStartTick,
  minuteOfDay,
  weekdayOfDay,
} from '@app/clock/domain/calendar-logic';
import { DAYS_PER_WEEK, TICKS_PER_MINUTE } from '@app/clock/domain/models/time.model';

import { intradayMinutes } from './candle-logic';
import { isMarketDay } from './market-calendar';
import { Candle, CandleResolution, IntradayResolution } from './models/candle.model';

// Block rules of the candle query (TS §8.2, §11.7 "Historie beim Scrollen"): which days a block
// ending at `to` covers, where the query limit cuts today, and whether older candles exist.

/** Most candles in one answer of the `candles` query. */
export const MAX_CANDLE_LIMIT = 2_000;

/**
 * Most market days of one intraday answer: a calendar month of hourly candles fits, and an index
 * (minute curves of all shares, about 10 ms a day) stays at about a quarter of a second.
 */
export const MAX_INTRADAY_DAYS = 23;

/** Session of a series in minutes of the day (open inclusive, close as the last minute value). */
export interface CandleSession {
  open: number;
  close: number;
}

/** Where a block starts: the first day to compute and the lower bound actually searched. */
export interface CandleBlockPlan {
  firstDay: number;
  searchedFrom: number;
}

export function isIntraday(resolution: CandleResolution): resolution is IntradayResolution {
  return resolution !== '1d' && resolution !== '1w';
}

/** Monday of the week of `day` (weeks start on Monday, like the weekly candles). */
export function weekStartDay(day: number): number {
  return day - weekdayOfDay(day);
}

/** First day whose start is at or after `tick`. */
export function firstDayFrom(tick: number): number {
  const day = dayIndex(tick);
  return dayStartTick(day) < tick ? day + 1 : day;
}

/** Candles of a full session: periods aligned to the minute of the day, cut at open and close. */
export function sessionCandleCount(
  resolution: IntradayResolution,
  { open, close }: CandleSession,
): number {
  const minutes = intradayMinutes(resolution);
  return Math.ceil(close / minutes) - Math.floor(open / minutes);
}

/**
 * Earliest day of the last `count` market days up to `lastDay` (inclusive), not before `minDay`.
 * Bounded by `minDay`, the block holds fewer market days; for `lastDay < minDay` it is empty.
 */
export function earliestMarketDay(lastDay: number, count: number, minDay: number): number {
  if (lastDay < minDay) {
    return minDay;
  }
  let day = lastDay;
  let found = isMarketDay(day) ? 1 : 0;
  while (found < count && day > minDay) {
    day--;
    if (isMarketDay(day)) {
      found++;
    }
  }
  return day;
}

/** Start of the first candle since the epoch (the first market day is day 0, a Wednesday). */
export function firstCandleTick(resolution: CandleResolution, session: CandleSession): number {
  let first = 0;
  while (!isMarketDay(first)) {
    first++;
  }
  if (resolution === '1w') {
    return dayStartTick(weekStartDay(first));
  }
  if (resolution === '1d') {
    return dayStartTick(first);
  }
  return dayStartTick(first) + session.open * TICKS_PER_MINUTE;
}

/**
 * Upper end of a query (the query limit, TS §8.2): `to` (default `now`), never after `now`. While
 * the session of the series has not opened today, today has no candle yet and the end moves to the
 * end of yesterday – so a daily or weekly block never asks for a day that is not stepped.
 */
export function candleQueryEnd(
  to: number | undefined,
  now: number,
  session: CandleSession,
): number {
  const end = Math.min(to ?? now, now);
  const today = dayIndex(now);
  if (dayIndex(end) === today && minuteOfDay(now) < session.open) {
    return dayStartTick(today) - 1;
  }
  return end;
}

/**
 * First day of the block of at most `limit` candles that ends at the day `lastDay` and starts at
 * `from` or later (`null` = since the epoch). Intraday blocks cover enough market days for `limit`
 * candles plus a partial day, at most `MAX_INTRADAY_DAYS`; daily blocks `limit` market days; weekly
 * blocks `limit` weeks. `searchedFrom` is the lower bound of the search, for `hasOlderCandles`.
 */
export function candleBlockPlan(
  resolution: CandleResolution,
  lastDay: number,
  limit: number,
  from: number | null,
  session: CandleSession,
): CandleBlockPlan {
  if (resolution === '1w') {
    let firstWeek = weekStartDay(0);
    if (from !== null) {
      const day = firstDayFrom(from);
      firstWeek = weekStartDay(day) < day ? weekStartDay(day) + DAYS_PER_WEEK : day;
    }
    const week = Math.max(weekStartDay(lastDay) - DAYS_PER_WEEK * (limit - 1), firstWeek);
    return { firstDay: Math.max(0, week), searchedFrom: dayStartTick(week) };
  }
  if (resolution === '1d') {
    const minDay = from === null ? 0 : Math.max(0, firstDayFrom(from));
    const firstDay = earliestMarketDay(lastDay, limit, minDay);
    return { firstDay, searchedFrom: dayStartTick(firstDay) };
  }
  const perDay = sessionCandleCount(resolution, session);
  const days = Math.min(MAX_INTRADAY_DAYS, Math.ceil(limit / perDay) + 1);
  const minDay = from === null ? 0 : Math.max(0, dayIndex(from));
  const firstDay = earliestMarketDay(lastDay, days, minDay);
  return { firstDay, searchedFrom: Math.max(from ?? -Infinity, dayStartTick(firstDay)) };
}

/**
 * Whether candles older than a block exist: `boundary` is the start of its first candle, or the
 * lower bound searched when the block is empty. `false` once the block reaches the epoch.
 */
export function hasOlderCandles(
  boundary: number,
  resolution: CandleResolution,
  session: CandleSession,
): boolean {
  return firstCandleTick(resolution, session) < boundary;
}

/**
 * A stored daily candle without high and low (before the background job, TS §6.8) shows the range
 * of open and close, like the lab's support candles.
 */
export function withHighLow(candle: Candle): Candle {
  const { open, close } = candle;
  return {
    ...candle,
    high: Number.isNaN(candle.high) ? Math.max(open, close) : candle.high,
    low: Number.isNaN(candle.low) ? Math.min(open, close) : candle.low,
  };
}
