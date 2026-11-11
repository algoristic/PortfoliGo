export const PRICE_CHART_TYPES = ['line', 'candles'] as const;
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
