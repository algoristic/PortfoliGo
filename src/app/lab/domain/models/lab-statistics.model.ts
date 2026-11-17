import { Tick } from '@app/clock/domain/models/time.model';
import { MarketPhase } from '@app/market/domain/models/market-config.model';
import { SizeClass } from '@app/world/domain/models/taxonomy.model';

/** Start of the period of the lab statistics; the end is always the current lab day. */
export const STATISTICS_STARTS = ['epoch', 'game-start'] as const;
export type StatisticsStart = (typeof STATISTICS_STARTS)[number];

/**
 * `ok`/`off`: measured value inside/outside the target; `short`: the period is shorter than the
 * target needs; `info`: no target (yet), shown for context.
 */
export const TARGET_STATUSES = ['ok', 'off', 'short', 'info'] as const;
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
  /** Work package or decision that brings the target back into its band or gives it one (E-39). */
  openUntil?: string;
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

/** Medians over a group of shares of their intraday measures (TS §6.9). */
export interface IntradayMeasures {
  /** Volatility of the minute returns in the session p. a. (mean taken as 0 within a day). */
  minuteVolatility: number;
  /** Mean daily range (high − low) / open. */
  dailyRange: number;
  /** Volatility of the session return (open → close) p. a. */
  sessionVolatility: number;
}

/** Shares of one exchange from the bridges and from the minute-by-minute reference (TS §6.1). */
export interface ReferenceComparison {
  exchangeId: string;
  shares: number;
  bridge: IntradayMeasures;
  reference: IntradayMeasures;
}

/** Intraday statistics over the last market days of the period (TS §6.9, AP 1.8b). */
export interface IntradayStatistics {
  fromTick: Tick;
  /** Exclusive: start of the day after the last day. */
  toTick: Tick;
  marketDays: number;
  /** Medians over all shares. */
  stocks: IntradayMeasures;
  worldIndex: Pick<IntradayMeasures, 'minuteVolatility' | 'dailyRange'>;
  reference: ReferenceComparison;
  /**
   * Volatility per part of the trading time relative to the whole session, median over the
   * shares; `INTRADAY_PARTS` values.
   */
  profile: number[];
  /** Median over the shares of the mean of the first and last part ÷ the mean of the middle. */
  profileRatio: number;
  /** Duration of the minute curves of all series in the worker; 0 without a clock. */
  curvesMs: number;
}

export const SIZE_CLASS_SHARES_KEYS = ['large', 'mid', 'small', 'all'] as const;
export type SizeClassSharesKey = (typeof SIZE_CLASS_SHARES_KEYS)[number];

/** Market at the close of the last market day before game start + `years` (TS §6.9, E-22). */
export interface LongTermCheckpoint {
  years: number;
  /** Start of the market day of the checkpoint; `null` when the period does not contain it. */
  tick: Tick | null;
  /** Share of the five largest constituents in the world index (`n_i · P_i`). */
  topFiveShare: number;
  /** Share of the shares below 1 € per size class and over all. */
  belowOneEuro: Record<SizeClassSharesKey, number>;
  /** Share of the shares at the price floor. */
  atFloor: number;
  maxPrice: number;
  /** Volatility p. a. of the world price index over the last 261 daily returns. */
  indexVolatility: number;
}

export interface WindowRange {
  min: number;
  median: number;
  max: number;
}

/** World index in rolling windows of `years`, shifted by one year each (TS §6.9). */
export interface RollingWindows {
  years: number;
  count: number;
  /** Geometric return of the total return index p. a. */
  totalReturn: WindowRange;
  /** Volatility of the price index p. a. */
  volatility: WindowRange;
  /** Dividend yield of the world index p. a. */
  dividendYield: WindowRange;
}

export interface LongTermStatistics {
  checkpoints: LongTermCheckpoint[];
  windows: RollingWindows[];
}

/** Long run of one seed for the seed comparison (TS §14.2), measured while simulating. */
export interface SeedRun {
  /** Normalized seed. */
  seed: string;
  /** Game years simulated after the game start. */
  years: number;
  marketDays: number;
  phaseShares: PhaseShare[];
  /** Over the whole run from the epoch: geometric return of the total return index p. a. */
  worldReturn: number;
  worldVolatility: number;
  worldDividendYield: number;
  longTerm: LongTermStatistics;
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
  intraday: IntradayStatistics;
  longTerm: LongTermStatistics;
}
