import { CandleRequest, ChartRange, LabChartOptions } from './lab.model';

import { dayIndex, dayStartTick } from '../../../clock/domain/calendar-logic';
import { Tick, TICKS_PER_DAY } from '../../../clock/domain/models/time.model';
import { isMarketDay } from '../../../market/domain/market-calendar';
import { CandleResolution } from '../../../market/domain/models/candle.model';
import { CandleSource } from '../../domain/models/candle-source.model';

/** Resolutions per range, so that a chart stays below a few thousand candles; first = default. */
export const RANGE_RESOLUTIONS: Record<ChartRange, readonly CandleResolution[]> = {
  '1d': ['5m', '1m', '15m', '1h'],
  '1w': ['15m', '5m', '1h', '1d'],
  '3m': ['1d', '1h', '1w'],
  '1y': ['1d', '1w'],
  max: ['1w', '1d'],
};

const RANGE_DAYS: Record<Exclude<ChartRange, '1d' | 'max'>, number> = {
  '1w': 7,
  '3m': 91,
  '1y': 365,
};

/** Merges a change into the chart options and keeps the resolution valid for the range. */
export function mergeChartOptions(
  options: LabChartOptions,
  change: Partial<LabChartOptions>,
): LabChartOptions {
  const merged = { ...options, ...change };
  const allowed = RANGE_RESOLUTIONS[merged.range];
  return allowed.includes(merged.resolution) ? merged : { ...merged, resolution: allowed[0] };
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
