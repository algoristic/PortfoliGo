export interface HistogramBar {
  center: number;
  count: number;
  height: number;
  normalHeight: number;
  /** Tooltip: centre of the bin in standard deviations and its count. */
  title: string;
}
