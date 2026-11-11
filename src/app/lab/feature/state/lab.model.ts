import { PriceChartType } from '../../../charts/ui/price-chart/price-chart.model';
import { Tick } from '../../../clock/domain/models/time.model';
import { CandleResolution } from '../../../market/domain/models/candle.model';
import { CandleSource } from '../../domain/models/candle-source.model';

/** Visible period of the lab chart, counted back from the current tick. */
export const CHART_RANGES = ['1d', '1w', '3m', '1y', 'max'] as const;
export type ChartRange = (typeof CHART_RANGES)[number];

export interface LabChartOptions {
  range: ChartRange;
  resolution: CandleResolution;
  chartType: PriceChartType;
}

export interface CandleRequest {
  series: number;
  resolution: CandleResolution;
  fromTick: Tick;
  toTick: Tick;
  source: CandleSource;
}

export const LAB_STATUSES = ['idle', 'generating', 'simulating', 'ready'] as const;
export type LabStatus = (typeof LAB_STATUSES)[number];

export interface LabTimings {
  worldMs: number;
  prehistoryMs: number;
  /** Duration of the last simulation run. */
  simulationMs?: number;
  /** Market days per second of the last simulation run. */
  marketDaysPerSecond?: number;
  candlesMs?: number;
}
