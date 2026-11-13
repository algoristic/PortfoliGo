import { dayIndex, dayStartTick } from '@app/clock/domain/calendar-logic';
import { Tick, TICKS_PER_DAY, TICKS_PER_MINUTE } from '@app/clock/domain/models/time.model';

import { intradayMinutes } from './candle-logic';
import {
  earliestMarketDay,
  isIntraday,
  MAX_CANDLE_LIMIT,
  MAX_INTRADAY_DAYS,
} from './candle-window';
import { isMarketDay } from './market-calendar';
import { Candle, CANDLE_RESOLUTIONS, CandleResolution } from './models/candle.model';
import {
  ChartBlock,
  ChartBlockRequest,
  ChartRange,
  LiveCandle,
  LiveCandleStep,
} from './models/chart.model';
import { marketDayOnOrBefore, monthsBackDay } from './performance-logic';

// Views of the price chart (US-CH-01, TS §11.7): the resolution and the blocks per period, the day
// navigation of 1T and the rule for live candles of the chart subscription (TS §8.4).

/** Automatic resolution per period (TS §11.7), used while the user chose none („Auto“). */
export const CHART_RANGE_INTERVALS: Readonly<Record<ChartRange, CandleResolution>> = {
  '1d': '1m',
  '5d': '15m',
  '1m': '1h',
  '6m': '1d',
  '1y': '1d',
  '5y': '1w',
  max: '1w',
};

/**
 * Most market days of a period for the choice of the resolution (TS §11.7): a calendar month has at
 * most 23 market days; `max` grows with the game and has no bound.
 */
const MARKET_DAYS_PER_MONTH = 23;
export const CHART_RANGE_MARKET_DAYS: Readonly<Record<ChartRange, number>> = {
  '1d': 1,
  '5d': 5,
  '1m': MARKET_DAYS_PER_MONTH,
  '6m': 6 * MARKET_DAYS_PER_MONTH,
  '1y': 12 * MARKET_DAYS_PER_MONTH,
  '5y': 60 * MARKET_DAYS_PER_MONTH,
  max: Number.POSITIVE_INFINITY,
};

/** Market days of a week candle. */
const MARKET_DAYS_PER_WEEK = 5;

/** Candles per market day, with a whole day of trading for intraday resolutions. */
function candlesPerMarketDay(resolution: CandleResolution): number {
  if (resolution === '1d') {
    return 1;
  }
  if (resolution === '1w') {
    return 1 / MARKET_DAYS_PER_WEEK;
  }
  return TICKS_PER_DAY / (intradayMinutes(resolution) * TICKS_PER_MINUTE);
}

/**
 * Whether the user may choose `resolution` for `range` (TS §11.7): the period holds more than one
 * candle and fits into one answer of the candle query (TS §8.2) – at most `MAX_CANDLE_LIMIT`
 * candles, counted with a whole day of trading, and intraday at most `MAX_INTRADAY_DAYS` market
 * days. „Auto“ is always allowed.
 */
export function isChartResolutionAllowed(range: ChartRange, resolution: CandleResolution): boolean {
  const days = CHART_RANGE_MARKET_DAYS[range];
  const candles = days * candlesPerMarketDay(resolution);
  return (
    candles > 1 &&
    candles <= MAX_CANDLE_LIMIT &&
    (!isIntraday(resolution) || days <= MAX_INTRADAY_DAYS)
  );
}

/** The resolutions the user may choose for `range`, finest first. */
export function chartResolutions(range: ChartRange): CandleResolution[] {
  return CANDLE_RESOLUTIONS.filter((resolution) => isChartResolutionAllowed(range, resolution));
}

/** The chosen resolution after a change of the period: kept while allowed, otherwise „Auto“. */
export function keptChartResolution(
  range: ChartRange,
  resolution: CandleResolution | null,
): CandleResolution | null {
  return resolution !== null && isChartResolutionAllowed(range, resolution) ? resolution : null;
}

/** The resolution the chart loads: the chosen one, or the automatic one of the period. */
export function chartInterval(
  range: ChartRange,
  resolution: CandleResolution | null,
): CandleResolution {
  return resolution ?? CHART_RANGE_INTERVALS[range];
}

/** Periods measured in market days; the others in calendar months, `max` from the epoch. */
const RANGE_MARKET_DAYS: Partial<Record<ChartRange, number>> = { '1d': 1, '5d': 5 };
const RANGE_MONTHS: Partial<Record<ChartRange, number>> = { '1m': 1, '6m': 6, '1y': 12, '5y': 60 };

/** The first market day since the epoch (01.01.2020, a Wednesday). */
export const FIRST_MARKET_DAY = 0;

/**
 * First day of a block of `range` that ends on `lastDay`: the last 1 or 5 market days, the same
 * date 1, 6, 12 or 60 calendar months back, or `null` for `max` (from the epoch).
 */
export function chartBlockStartDay(range: ChartRange, lastDay: number): number | null {
  const marketDays = RANGE_MARKET_DAYS[range];
  if (marketDays !== undefined) {
    return earliestMarketDay(lastDay, marketDays, FIRST_MARKET_DAY);
  }
  const months = RANGE_MONTHS[range];
  return months === undefined ? null : monthsBackDay(lastDay, months);
}

/**
 * The first block of a chart in `interval`. A chosen day (1T) is that whole day. Live, the block ends now; 1T and
 * 5T reach one market day further back, because before the open today has no candles yet –
 * `trimChartBlock` then keeps the last 1 or 5 days that have candles.
 */
export function chartStartRequest(
  range: ChartRange,
  day: number | null,
  now: Tick,
  interval: CandleResolution = CHART_RANGE_INTERVALS[range],
): ChartBlockRequest {
  if (day !== null) {
    const from = dayStartTick(day);
    return { interval, from, to: from + TICKS_PER_DAY - 1, limit: MAX_CANDLE_LIMIT };
  }
  const today = dayIndex(now);
  const marketDays = RANGE_MARKET_DAYS[range];
  const firstDay =
    marketDays === undefined
      ? chartBlockStartDay(range, today)
      : earliestMarketDay(today, marketDays + 1, FIRST_MARKET_DAY);
  return firstDay === null
    ? { interval, limit: MAX_CANDLE_LIMIT }
    : { interval, from: dayStartTick(firstDay), limit: MAX_CANDLE_LIMIT };
}

/** The candles of the last `count` days that have candles; older ones count as `hasOlder`. */
export function trimChartBlock(
  range: ChartRange,
  day: number | null,
  block: ChartBlock,
): ChartBlock {
  const count = RANGE_MARKET_DAYS[range];
  if (day !== null || count === undefined) {
    return block;
  }
  const { candles } = block;
  let start = candles.length;
  let days = 0;
  let current: number | null = null;
  while (start > 0) {
    const candleDay = dayIndex(candles[start - 1].tick);
    if (candleDay !== current) {
      if (days === count) {
        break;
      }
      days++;
      current = candleDay;
    }
    start--;
  }
  return start === 0 ? block : { candles: candles.slice(start), hasOlder: true };
}

/**
 * The next older block before the oldest loaded candle (scrolling, TS §11.7): one more period of
 * the same length. Intraday blocks end with the day before, so they always hold whole days.
 */
export function olderChartRequest(
  range: ChartRange,
  oldestTick: Tick,
  interval: CandleResolution = CHART_RANGE_INTERVALS[range],
): ChartBlockRequest {
  const to = isIntraday(interval) ? dayStartTick(dayIndex(oldestTick)) - 1 : oldestTick - 1;
  const firstDay = chartBlockStartDay(range, dayIndex(to));
  return firstDay === null
    ? { interval, to, limit: MAX_CANDLE_LIMIT }
    : { interval, from: dayStartTick(firstDay), to, limit: MAX_CANDLE_LIMIT };
}

/** Older candles in front of the loaded ones; drops candles the blocks share. */
export function prependCandles(older: readonly Candle[], loaded: readonly Candle[]): Candle[] {
  if (loaded.length === 0) {
    return [...older];
  }
  const first = loaded[0].tick;
  return [...older.filter((candle) => candle.tick < first), ...loaded];
}

/** The day the 1T chart shows: the chosen one, live the day of the newest candle or today. */
export function shownChartDay(day: number | null, candles: readonly Candle[], now: Tick): number {
  if (day !== null) {
    return day;
  }
  const last = candles.at(-1);
  return last === undefined ? marketDayOnOrBefore(dayIndex(now)) : dayIndex(last.tick);
}

/** The market day before `day`, `null` at the first market day. */
export function previousChartDay(day: number): number | null {
  if (day <= FIRST_MARKET_DAY) {
    return null;
  }
  return Math.max(FIRST_MARKET_DAY, marketDayOnOrBefore(day - 1));
}

/** The market day after `day`; `null` (live) once it reaches today. */
export function nextChartDay(day: number, now: Tick): number | null {
  let next = day + 1;
  while (!isMarketDay(next)) {
    next++;
  }
  return next >= dayIndex(now) ? null : next;
}

/**
 * The 1T day for a chosen date (day index): the market day on or before it, at least the first
 * one; today and later are live (`null`).
 */
export function chosenChartDay(day: number, now: Tick): number | null {
  if (day >= dayIndex(now)) {
    return null;
  }
  return Math.max(FIRST_MARKET_DAY, marketDayOnOrBefore(day));
}

/**
 * What a live candle does to the loaded candles (TS §8.4): the same start replaces the newest; a
 * new candle is appended when `previous` finishes the newest loaded one, otherwise candles were
 * skipped and the block loads again. A 1T chart loads again when a new day begins, so it keeps
 * showing one day.
 */
export function liveCandleStep(
  range: ChartRange,
  loaded: readonly Candle[],
  { candle, previous }: LiveCandle,
): LiveCandleStep {
  const last = loaded.at(-1);
  if (last === undefined) {
    return 'reload';
  }
  if (candle.tick < last.tick) {
    return 'ignore';
  }
  if (candle.tick === last.tick) {
    return 'replace';
  }
  if (range === '1d' && dayIndex(candle.tick) !== dayIndex(last.tick)) {
    return 'reload';
  }
  return previous?.tick === last.tick ? 'append' : 'reload';
}

/** The loaded candles after `liveCandleStep`; `ignore` and `reload` keep them. */
export function applyLiveCandle(
  loaded: readonly Candle[],
  live: LiveCandle,
  step: LiveCandleStep,
): readonly Candle[] {
  switch (step) {
    case 'replace':
      return [...loaded.slice(0, -1), live.candle];
    case 'append':
      return live.previous === undefined
        ? loaded
        : [...loaded.slice(0, -1), live.previous, live.candle];
    default:
      return loaded;
  }
}
