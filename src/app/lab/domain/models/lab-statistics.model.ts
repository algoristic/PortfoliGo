import { Tick } from '../../../clock/domain/models/time.model';
import { MarketPhase } from '../../../market/domain/models/market-config.model';
import { SizeClass } from '../../../world/domain/models/taxonomy.model';

/** Start of the period of the lab statistics; the end is always the current lab day. */
export const STATISTICS_STARTS = ['epoch', 'game-start'] as const;
export type StatisticsStart = (typeof STATISTICS_STARTS)[number];

/**
 * `ok`/`off`: measured value inside/outside the target; `short`: the period is shorter than the
 * target needs; `info`: no target, shown for context; `open`: measured in a later work package.
 */
export const TARGET_STATUSES = ['ok', 'off', 'short', 'info', 'open'] as const;
export type TargetStatus = (typeof TARGET_STATUSES)[number];

export const TARGET_UNITS = ['percent', 'number', 'per-year'] as const;
export type TargetUnit = (typeof TARGET_UNITS)[number];

/** One measured calibration quantity (TS §6.9). */
export interface TargetRow {
  id: string;
  /** `NaN` when not measurable (period too short, quantity measured later). */
  value: number;
  unit: TargetUnit;
  min?: number;
  max?: number;
  minYears?: number;
  status: TargetStatus;
}

export interface PhaseSegment {
  phase: MarketPhase;
  fromTick: Tick;
  /** Exclusive: start of the day after the last day of the segment. */
  toTick: Tick;
  marketDays: number;
}

export interface PhaseShare {
  phase: MarketPhase;
  share: number;
  /** Typical share of the time from TS §6.3. */
  typical: number;
}

/** Mean pairwise correlation of daily returns per sector pair, only pairs of the same region. */
export interface CorrelationMatrix {
  sectorIds: string[];
  /** `[row][column]`; `NaN` without pairs. Symmetric, the diagonal is the within-sector value. */
  values: number[][];
}

/** Daily log returns of the world price index, standardized to z scores. */
export interface ReturnDistribution {
  /** Lower bound of the first bin in standard deviations; bins are equally wide. */
  min: number;
  binWidth: number;
  counts: number[];
  /** Expected counts per bin under a normal distribution with the same number of returns. */
  normal: number[];
  outside: number;
  skewness: number;
  kurtosis: number;
}

export interface DrawdownRow {
  peakTick: Tick;
  troughTick: Tick;
  /** `null` while not recovered. */
  recoveryTick: Tick | null;
  depth: number;
}

export interface SizeVolatility {
  size: SizeClass;
  count: number;
  p10: number;
  median: number;
  p90: number;
}

export interface LabStatistics {
  start: StatisticsStart;
  fromTick: Tick;
  toTick: Tick;
  marketDays: number;
  /** Market days divided by the market days per year. */
  years: number;
  targets: TargetRow[];
  phases: PhaseSegment[];
  phaseShares: PhaseShare[];
  correlations: CorrelationMatrix;
  sizeVolatility: SizeVolatility[];
  distribution: ReturnDistribution;
  maxDrawdown: number;
  drawdowns: DrawdownRow[];
}
