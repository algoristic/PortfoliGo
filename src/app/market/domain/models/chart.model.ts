import { Tick } from '@app/clock/domain/models/time.model';

import { Candle, CandleResolution } from './candle.model';

/** Periods of the price chart (US-CH-01); each sets the resolution and the first view. */
export const CHART_RANGES = ['1d', '5d', '1m', '6m', '1y', '5y', 'max'] as const;
export type ChartRange = (typeof CHART_RANGES)[number];

/** A `candles` query of the chart (TS §8.2): the newest `limit` candles in `[from, to]`. */
export interface ChartBlockRequest {
  interval: CandleResolution;
  from?: Tick;
  to?: Tick;
  limit: number;
}

/** A block of candles in ascending order and whether older ones exist. */
export interface ChartBlock {
  candles: Candle[];
  hasOlder: boolean;
}

/**
 * The newest candle of a chart subscription (TS §8.4): `previous` is the finished candle before it
 * when a new candle began since the last event.
 */
export interface LiveCandle {
  candle: Candle;
  previous?: Candle;
}

/**
 * What a live candle does to the loaded candles: replace the newest, finish it and append the new
 * one, nothing (older than the loaded ones), or load the block again (skipped candles, new day).
 */
export const LIVE_CANDLE_STEPS = ['replace', 'append', 'ignore', 'reload'] as const;
export type LiveCandleStep = (typeof LIVE_CANDLE_STEPS)[number];

/** A value of an indicator line at the start of a candle. */
export interface IndicatorLinePoint {
  tick: Tick;
  value: number;
}

/**
 * The lines of an indicator over the shown candles (TS §11.7): one for a moving average, middle,
 * upper and lower band for Bollinger bands.
 */
export type IndicatorLines = readonly (readonly IndicatorLinePoint[])[];
