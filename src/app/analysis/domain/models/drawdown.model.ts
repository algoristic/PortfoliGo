/** A drawdown episode by index into the value series. */
export interface DrawdownEpisode {
  /** Index of the running high before the episode. */
  peak: number;
  /** Index of the lowest value of the episode. */
  trough: number;
  /** Index of the first value at or above the peak again; `null` while not recovered. */
  recovery: number | null;
  /** Relative loss from peak to trough, e.g. `0.25` for −25 %. */
  depth: number;
}
