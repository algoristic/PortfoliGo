import { Tick } from '@app/clock/domain/models/time.model';
import { Cents } from '@app/shared/domain/models/money.model';

/**
 * Benchmark shadow portfolio (TS §7.9, US-PF-05): it buys units of the world performance index with
 * the start capital and every net inflow at the index close, without costs and taxes. Amounts are
 * unrounded cents; the daily series rounds them.
 */
export interface BenchmarkState {
  units: number;
  /** Flows not yet invested: they wait for the next close of the index. */
  pending: number;
  /** Last close of the index in euros per unit; `null` before the first. */
  close: number | null;
  /** Value at the end of the previous day, the start of the running day. */
  dayStartValue: number;
  /** Chained growth factor of its time-weighted return since the start (1 at the start). */
  index: number;
  /** `index` at the end of the previous year (the start in the first year). */
  yearStartIndex: number;
}

/**
 * Running performance of a player (TS §7.9): the running day and the chained values up to its
 * start. The engine keeps it in the player state; the days that ended go to the daily series.
 */
export interface PerformanceState {
  startTick: Tick;
  /** Net worth at the start: the start capital. */
  startValue: Cents;
  /** Running calendar day (days since the epoch). */
  day: number;
  /** Net worth at the end of the previous day (`V_start`). */
  dayStartValue: Cents;
  /** External flows of the running day so far (`CF_day`): income − living costs. */
  dayFlow: Cents;
  /** External flows of all days before the running one. */
  totalFlow: Cents;
  /** Chained growth factor of the time-weighted return up to the start of the running day. */
  index: number;
  /** Days before the running one left out of the chain (`V_start + CF_day ≤ 0`). */
  skippedDays: number;
  /** `index` at the end of the previous year (the start in the first year). */
  yearStartIndex: number;
  /** `null` in a world without a world index. */
  benchmark: BenchmarkState | null;
}

/**
 * One calendar day of the daily series (TS §7.9, §9.1 `series`), taken at its end. The cumulative
 * fields make the figures of any period a difference or a ratio of two points.
 */
export interface DailyPoint {
  /** Calendar day (days since the epoch). */
  day: number;
  /** End of the day: 00:00 of the next one. */
  tick: Tick;
  netWorth: Cents;
  /** Sum of the account balances (overdrafts negative). */
  cash: Cents;
  /** Value of the positions at the bid without a venue mark-up. */
  securities: Cents;
  /** External flows of the day. */
  flow: Cents;
  /** External flows since the start, this day included. */
  totalFlow: Cents;
  /** Second comparison value (E-28): start capital + `totalFlow`. */
  comparison: Cents;
  /** Chained growth factor of the time-weighted return since the start, this day included. */
  index: number;
  /** Days left out of the chain since the start, this day included. */
  skippedDays: number;
  /** Value of the benchmark at the end of the day; `null` without a world index. */
  benchmarkValue: Cents | null;
  /** Growth factor of the benchmark's time-weighted return; `null` without a world index. */
  benchmarkIndex: number | null;
}

/** Values of a day end or of now. */
export interface PortfolioValues {
  cash: Cents;
  securities: Cents;
}

/** Time-weighted returns of a period (US-PF-05); ratios, not percent. */
export interface PeriodReturns {
  /** Since the start of the game. */
  sinceStart: number;
  /** Since the end of the previous year (since the start in the first year); `null` after a total loss. */
  yearToDate: number | null;
  /** Annualised over the calendar days since the start (act/365); `null` before a full year. */
  annualized: number | null;
}

/** Live figures of the dashboard (US-PF-01, US-PF-05), computed at `tick`. */
export interface PerformanceFigures {
  tick: Tick;
  startTick: Tick;
  startValue: Cents;
  netWorth: Cents;
  cash: Cents;
  securities: Cents;
  /** External flows since the start, today's included. */
  totalFlow: Cents;
  /** Second comparison value (E-28): start capital + `totalFlow`. */
  comparison: Cents;
  /** Change since the start without external flows: `netWorth − comparison`. */
  sinceStart: Cents;
  /** Change today without external flows (US-PF-01) and today's flows. */
  today: { change: Cents; ratio: number | null; flow: Cents };
  returns: PeriodReturns;
  /** Days left out of the chain, today included when it cannot be chained (TS §7.9). */
  skippedDays: number;
  benchmark: { value: Cents; returns: PeriodReturns } | null;
}

/** Periods of the net worth chart (US-PF-04). */
export const HISTORY_RANGES = ['1m', '6m', '1y', '5y', 'max'] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];

/** Resolutions of a thinned daily series: the last day of each day, week, month or year. */
export const SERIES_RESOLUTIONS = ['day', 'week', 'month', 'year'] as const;
export type SeriesResolution = (typeof SERIES_RESOLUTIONS)[number];

/** A daily series thinned to at most a number of points. */
export interface ThinnedSeries {
  points: DailyPoint[];
  resolution: SeriesResolution;
}
