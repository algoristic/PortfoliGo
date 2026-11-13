import { RegionId, SectorId, SizeClass, Style } from '@app/world/domain/models/taxonomy.model';

import { InstrumentKind } from './instrument.model';

import { PerformancePeriod } from '../performance-logic';

export const SCREENER_SORT_KEYS = [
  'name',
  'changeRatio',
  'm1',
  'm6',
  'y1',
  'y5',
  'dividendYield',
] as const;
export type ScreenerSortKey = (typeof SCREENER_SORT_KEYS)[number];

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export interface ScreenerSort {
  key: ScreenerSortKey;
  direction: SortDirection;
}

/** Dividend yield range as fractions (0.03 = 3 %), bounds inclusive; a missing bound is open. */
export interface YieldRange {
  min?: number;
  max?: number;
}

/**
 * Search, filters and sorting of the screener (TS §8.2, US-MK-02). A missing or empty list doesn't
 * filter; lists are ORed, dimensions ANDed.
 */
export interface ScreenerCriteria {
  search?: string;
  assetClasses?: InstrumentKind[];
  regions?: RegionId[];
  /** ISO country codes. */
  countries?: string[];
  sectors?: SectorId[];
  industries?: string[];
  sizes?: SizeClass[];
  styles?: Style[];
  dividendYield?: YieldRange;
  /** Default: by name, ascending. */
  sort?: ScreenerSort;
}

/** Figures of a series at the current tick (TS §8.2); `null` where they don't exist. */
export interface ScreenerMetrics {
  /** As in the quote (TS §8.4). */
  changeRatio: number;
  /** Change against the close before 1, 6, 12 and 60 calendar months; `null` before the epoch. */
  performance: Record<PerformancePeriod, number | null>;
  /** Trailing twelve months; 0 without dividends, `null` for indices. */
  dividendYield: number | null;
}

/** A match of the screener: the series, its figures and the sparkline. */
export interface ScreenerRow extends ScreenerMetrics {
  id: string;
  series: number;
  last: number;
  /**
   * About one month of daily closes (`SPARKLINE_CLOSES`) up to the previous close of the quote,
   * then the current price, oldest first.
   */
  sparkline: number[];
}
