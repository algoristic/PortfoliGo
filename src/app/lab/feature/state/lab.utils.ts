import { CandleRequest, ChartRange, LabChartOptions } from './lab.model';

import { dayIndex, dayStartTick } from '../../../clock/domain/calendar-logic';
import { Tick, TICKS_PER_DAY } from '../../../clock/domain/models/time.model';
import { isMarketDay } from '../../../market/domain/market-calendar';
import { Candle, CandleResolution } from '../../../market/domain/models/candle.model';
import { CandleSource } from '../../domain/models/candle-source.model';

/** Resolutions per range, fine to coarse, so that a chart stays below a few thousand candles. */
export const RANGE_RESOLUTIONS: Record<ChartRange, readonly CandleResolution[]> = {
  '1d': ['1m', '5m', '15m', '1h'],
  '1w': ['5m', '15m', '1h', '1d'],
  '3m': ['1h', '1d', '1w'],
  '1y': ['1d', '1w'],
  max: ['1d', '1w'],
};

/** Resolution chosen when the range changes and the current one is not allowed. */
export const DEFAULT_RESOLUTIONS: Record<ChartRange, CandleResolution> = {
  '1d': '5m',
  '1w': '15m',
  '3m': '1d',
  '1y': '1d',
  max: '1w',
};

const RANGE_DAYS: Record<Exclude<ChartRange, '1d' | 'max'>, number> = {
  '1w': 7,
  '3m': 91,
  '1y': 365,
};

/**
 * Merges a change into the chart options and keeps the resolution valid for the range; returns
 * `options` itself when nothing changes.
 */
export function mergeChartOptions(
  options: LabChartOptions,
  change: Partial<LabChartOptions>,
): LabChartOptions {
  const merged = { ...options, ...change };
  if (!RANGE_RESOLUTIONS[merged.range].includes(merged.resolution)) {
    merged.resolution = DEFAULT_RESOLUTIONS[merged.range];
  }
  return merged.range === options.range &&
    merged.resolution === options.resolution &&
    merged.chartType === options.chartType
    ? options
    : merged;
}

/** Start of the visible period: the last market day up to `now` for `1d`, the epoch for `max`. */
export function rangeStart(range: ChartRange, now: Tick): Tick {
  switch (range) {
    case '1d': {
      for (let day = dayIndex(now); day >= 0; day--) {
        if (isMarketDay(day)) {
          return dayStartTick(day);
        }
      }
      return 0;
    }
    case 'max':
      return 0;
    default:
      return Math.max(0, now - RANGE_DAYS[range] * TICKS_PER_DAY);
  }
}

/**
 * Since the epoch, an index or ETF chart from the minute curves would recompute every share for
 * every day (about 2.5 s per game year); the support points take well under a second.
 */
export function candleSource(range: ChartRange): CandleSource {
  return range === 'max' ? 'support' : 'minutes';
}

export function candleRequest(series: number, options: LabChartOptions, now: Tick): CandleRequest {
  return {
    series,
    resolution: options.resolution,
    fromTick: rangeStart(options.range, now),
    toTick: now,
    source: candleSource(options.range),
  };
}

/** Calendar days loaded per history block when the chart scrolls past its oldest candle. */
export const HISTORY_CHUNK_DAYS: Record<ChartRange, number> = {
  '1d': 7,
  '1w': 7,
  '3m': 91,
  '1y': 365,
  max: 0,
};

/**
 * Block of older candles before `historyFrom` (start of the period loaded so far), or `null` once
 * the history reaches the epoch.
 */
export function historyRequest(
  series: number,
  options: LabChartOptions,
  historyFrom: Tick,
): CandleRequest | null {
  if (historyFrom <= 0) {
    return null;
  }
  const toTick = historyFrom - 1;
  return {
    series,
    resolution: options.resolution,
    fromTick: Math.max(0, toTick - HISTORY_CHUNK_DAYS[options.range] * TICKS_PER_DAY),
    toTick,
    source: candleSource(options.range),
  };
}

export function isSameCandleRequest(a: CandleRequest, b: CandleRequest | null): boolean {
  return (
    b !== null &&
    a.series === b.series &&
    a.resolution === b.resolution &&
    a.fromTick === b.fromTick &&
    a.toTick === b.toTick &&
    a.source === b.source
  );
}

/** Older candles before the loaded ones; drops candles the history block shares with them. */
export function prependCandles(older: readonly Candle[], candles: readonly Candle[]): Candle[] {
  const first = candles[0];
  return first === undefined
    ? [...older]
    : [...older.filter((candle) => candle.tick < first.tick), ...candles];
}
