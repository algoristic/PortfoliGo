import { IndexComposition } from '@app/market/domain/models/instrument-figures.model';
import {
  DailyPoint,
  HistoryRange,
  SeriesResolution,
} from '@app/portfolio/domain/models/performance.model';

/** Quote subscription of the depot page (TS §8.4, §11.3). */
export const PORTFOLIO_SUBSCRIPTION = 'portfolio';

/** The composition of an ETF's index as of the close before the market day `day` (TS §8.2). */
export interface LoadedComposition {
  day: number;
  /** `null` when the engine has none (not an ETF). */
  composition: IndexComposition | null;
}

/** Period of the net worth chart when a game starts (US-PF-04). */
export const DEFAULT_HISTORY_RANGE: HistoryRange = '1y';

/** The daily series of a chart period as loaded (AP 5.7), up to the last day that ended. */
export interface LoadedHistory {
  range: HistoryRange;
  points: DailyPoint[];
  resolution: SeriesResolution;
  /** Tick of the query. */
  tick: number;
}

/** What the net worth chart shows (US-PF-04): the period, its series and whether it loads. */
export interface PerformanceHistoryView {
  range: HistoryRange;
  /** Series of `range`; `null` until the first one arrived. */
  history: LoadedHistory | null;
  loading: boolean;
  failed: boolean;
}
