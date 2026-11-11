import { Tick } from '../../../clock/domain/models/time.model';

export const CANDLE_RESOLUTIONS = ['1m', '5m', '15m', '1h', '1d', '1w'] as const;
export type CandleResolution = (typeof CANDLE_RESOLUTIONS)[number];

export const INTRADAY_RESOLUTIONS = ['1m', '5m', '15m', '1h'] as const;
export type IntradayResolution = (typeof INTRADAY_RESOLUTIONS)[number];

/**
 * Candle for `[tick, tick + resolution)` in euros (TS §6.8). `open` is the price at the start,
 * `close` the price at the end of the period (or the official close), so neighbouring candles
 * connect. High and low are `NaN` while they are missing after batch runs.
 */
export interface Candle {
  tick: Tick;
  open: number;
  high: number;
  low: number;
  close: number;
}
