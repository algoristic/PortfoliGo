import { ScreenerSortKey, SortDirection } from '@app/market/domain/models/screener.model';
import { PerformancePeriod } from '@app/market/domain/performance-logic';

/** `aria-sort` of a column head. */
export type AriaSort = 'ascending' | 'descending' | 'none';

/** A sort button of the list head. */
export interface ScreenerSortButton {
  key: ScreenerSortKey;
  label: string;
  /** Spelled out for assistive technology after the short label, e.g. `(Performance 1 Jahr)`. */
  description: string | null;
  active: boolean;
  direction: SortDirection | null;
  ariaSort: AriaSort;
  icon: string;
}

export interface ScreenerPeriodLabel {
  period: PerformancePeriod;
  short: string;
  long: string;
}
