export const TABLE_DENSITIES = ['comfortable', 'compact', 'flush'] as const;
export type TableDensity = (typeof TABLE_DENSITIES)[number];

export const TABLE_CELL_ALIGNS = ['start', 'center', 'end'] as const;
export type TableCellAlign = (typeof TABLE_CELL_ALIGNS)[number];
