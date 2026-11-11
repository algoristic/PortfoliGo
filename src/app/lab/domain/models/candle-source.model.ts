/**
 * Where the lab takes candles from: the minute curves (exact high and low) or only the daily
 * support points (fast over long periods, open and close only).
 */
export const CANDLE_SOURCES = ['minutes', 'support'] as const;
export type CandleSource = (typeof CANDLE_SOURCES)[number];
