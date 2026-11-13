import { dayIndex, dayStartTick } from '@app/clock/domain/calendar-logic';
import { Tick } from '@app/clock/domain/models/time.model';

import { earliestMarketDay, MAX_CANDLE_LIMIT } from './candle-window';
import { FIRST_MARKET_DAY, liveCandleStep, trimChartBlock } from './chart-view-logic';
import { Candle, CandleResolution } from './models/candle.model';
import { ChartBlockRequest, LiveCandle, LiveCandleStep } from './models/chart.model';

// Sparklines of the indices on the markets page (US-MK-01, TS §11.3): the 15-minute candles of the
// running trading day; before the open and outside trading hours those of the last trading day.

export const OVERVIEW_SPARKLINE_INTERVAL: CandleResolution = '15m';

/**
 * The candle query of an overview sparkline: today and the market day before, because before the
 * open today has no candles yet; `overviewSparklineCandles` keeps the last day with candles.
 */
export function overviewSparklineRequest(now: Tick): ChartBlockRequest {
  const firstDay = earliestMarketDay(dayIndex(now), 2, FIRST_MARKET_DAY);
  return {
    interval: OVERVIEW_SPARKLINE_INTERVAL,
    from: dayStartTick(firstDay),
    limit: MAX_CANDLE_LIMIT,
  };
}

/** The candles of the newest day that has candles. */
export function overviewSparklineCandles(candles: readonly Candle[]): Candle[] {
  return trimChartBlock('1d', null, { candles: [...candles], hasOlder: false }).candles;
}

/**
 * What a live candle does to the sparkline: as on the 1T chart, a new day or skipped candles load
 * the block again.
 */
export function overviewSparklineStep(loaded: readonly Candle[], live: LiveCandle): LiveCandleStep {
  return liveCandleStep('1d', loaded, live);
}

/** The points of the line: the open of the day, then every close. */
export function overviewSparklinePoints(candles: readonly Candle[]): number[] {
  const first = candles[0];
  return first === undefined ? [] : [first.open, ...candles.map((candle) => candle.close)];
}
