import { InstrumentKind } from '@app/market/domain/models/instrument.model';
import { ScreenerSort, YieldRange } from '@app/market/domain/models/screener.model';
import { RegionId, SectorId, SizeClass, Style } from '@app/world/domain/models/taxonomy.model';

/** The list dimensions of the screener filter (US-MK-02, TS §5.3). */
export const SCREENER_FILTER_DIMENSIONS = [
  'assetClasses',
  'regions',
  'countries',
  'sectors',
  'industries',
  'sizes',
  'styles',
] as const;
export type ScreenerFilterDimension = (typeof SCREENER_FILTER_DIMENSIONS)[number];

/** The criteria as the slice holds them: every list present (empty = no filter). */
export interface ScreenerFilter {
  search: string;
  assetClasses: readonly InstrumentKind[];
  regions: readonly RegionId[];
  countries: readonly string[];
  sectors: readonly SectorId[];
  industries: readonly string[];
  sizes: readonly SizeClass[];
  styles: readonly Style[];
  dividendYield: YieldRange;
  sort: ScreenerSort;
}

/** Rows `start` (inclusive) to `end` (exclusive) that the list renders. */
export interface ScreenerRange {
  start: number;
  end: number;
}

/** A row of the screener list with the live quote where one arrived. */
export interface ScreenerRowView {
  id: string;
  series: number;
  name: string;
  ticker: string;
  kind: InstrumentKind;
  last: number;
  changeRatio: number;
  sparkline: readonly number[];
  /** The performance column: the period of the sort, else one year. */
  performance: number | null;
  dividendYield: number | null;
}
