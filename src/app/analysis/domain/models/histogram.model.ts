/** Counts of values in `bins` equally wide buckets from `min` to `max`. */
export interface Histogram {
  min: number;
  max: number;
  binWidth: number;
  counts: number[];
  /** Values below `min` or above `max`, not counted in `counts`. */
  below: number;
  above: number;
}
