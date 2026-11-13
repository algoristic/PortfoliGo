import { ScreenerFilterDimension } from '../models/screener-view.model';

export interface ScreenerFilterOption {
  id: string;
  label: string;
  selected: boolean;
}

/** A list dimension of the filter with its options (US-MK-02). */
export interface ScreenerFilterGroup {
  dimension: ScreenerFilterDimension;
  label: string;
  options: ScreenerFilterOption[];
  /** Number of chosen values, shown in the closed group. */
  selectedCount: number;
}

export interface ScreenerFilterSelection {
  dimension: ScreenerFilterDimension;
  values: string[];
}
