import { Tick } from '@app/clock/domain/models/time.model';
import { Candle } from '@app/market/domain/models/candle.model';

import { ChartColor } from '../models/chart-color.model';

export const PRICE_CHART_TYPES = ['line', 'area', 'candles'] as const;
export type PriceChartType = (typeof PRICE_CHART_TYPES)[number];

/** Colours of the chart, read from the `--pgo-*` tokens of the current theme. */
export interface PriceChartColors {
  background: string;
  text: string;
  textMuted: string;
  grid: string;
  line: string;
  up: string;
  down: string;
  /** Category colours for overlays. */
  categories: Record<ChartColor, string>;
}

/** Point of a line series; `time` in seconds (see `tickToChartTime`). */
export interface PriceChartLinePoint {
  time: number;
  value: number;
}

export interface PriceChartCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** A value of an overlay line at the start of a candle. */
export interface PriceChartOverlayPoint {
  tick: Tick;
  value: number;
}

export const PRICE_CHART_LINE_STYLES = ['solid', 'dashed'] as const;
export type PriceChartLineStyle = (typeof PRICE_CHART_LINE_STYLES)[number];

/**
 * A line over the price (e.g. an indicator, AP 4.3) in a category colour, solid unless `lineStyle`
 * says otherwise. Points that keep their values from one input to the next are updated
 * incrementally like candles. `fillTo` fills the area between this line and a second line with the
 * same ticks translucently in a colour derived from `color` (Bollinger bands, AP 5.8).
 */
export interface PriceChartOverlay {
  id: string;
  points: readonly PriceChartOverlayPoint[];
  color: ChartColor;
  lineStyle?: PriceChartLineStyle;
  fillTo?: readonly PriceChartOverlayPoint[];
}

/** The visible period of the chart in game time; `null` without data. */
export interface PriceChartRange {
  from: Tick;
  to: Tick;
}

/** The candle under the crosshair and the overlay values at its time. */
export interface PriceChartCrosshair {
  candle: Candle;
  overlays: { id: string; value: number }[];
}
