/** One row of the seed comparison: a seed or the median over the seeds. */
export interface SeedRowView {
  /** Normalized seed, or `median` for the median row. */
  key: string;
  label: string;
  cells: { id: string; text: string }[];
}

export interface SeedColumn {
  id: string;
  label: string;
}
