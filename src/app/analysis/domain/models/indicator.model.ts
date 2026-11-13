/** Chart indicators (US-CH-02, TS §11.7). */
export const INDICATOR_KINDS = ['sma', 'ema', 'smma', 'bollinger'] as const;
export type IndicatorKind = (typeof INDICATOR_KINDS)[number];

export const MOVING_AVERAGE_KINDS = ['sma', 'ema', 'smma'] as const;
export type MovingAverageKind = (typeof MOVING_AVERAGE_KINDS)[number];

/** A moving average over `period` values. */
export interface MovingAverageSpec {
  kind: MovingAverageKind;
  period: number;
}

/** Bollinger bands: SMA(`period`) ± `multiplier` population standard deviations. */
export interface BollingerSpec {
  kind: 'bollinger';
  period: number;
  multiplier: number;
}

export type IndicatorSpec = MovingAverageSpec | BollingerSpec;

/**
 * The values of an indicator at one input value, one per line: `[value]` for moving averages,
 * `[middle, upper, lower]` for Bollinger bands.
 */
export type IndicatorPoint = readonly number[];

/**
 * Continues an indicator value by value (TS §11.7): `push` adds a value, `replaceLast` changes the
 * newest one (the running candle). Both return the point at the newest value, `null` before
 * `period` values. The results are bit-identical to `indicatorSeries` over the same values.
 */
export interface IndicatorTracker {
  readonly spec: IndicatorSpec;
  /** Number of values so far. */
  readonly count: number;
  push(value: number): IndicatorPoint | null;
  replaceLast(value: number): IndicatorPoint | null;
}
