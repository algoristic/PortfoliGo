import { MarketContext } from './market-context';

/** Kinds of price series: shares, price indices, total return indices and ETFs (TS §6.6). */
export const SERIES_KINDS = ['stock', 'index', 'total-return', 'etf'] as const;
export type SeriesKind = (typeof SERIES_KINDS)[number];

/** Series index → kind and index within its kind. */
export interface SeriesRef {
  kind: SeriesKind;
  index: number;
}

/**
 * Series are numbered in one range: shares `0 … S − 1` (the instrument index), then the price
 * indices, then the total return indices, then the ETFs.
 */
export function seriesCount(context: MarketContext): number {
  return (
    context.layout.instrumentIds.length + 2 * context.indices.ids.length + context.etfs.ids.length
  );
}

export function indexSeries(context: MarketContext, x: number): number {
  return context.layout.instrumentIds.length + x;
}

export function totalReturnSeries(context: MarketContext, x: number): number {
  return context.layout.instrumentIds.length + context.indices.ids.length + x;
}

export function etfSeries(context: MarketContext, e: number): number {
  return context.layout.instrumentIds.length + 2 * context.indices.ids.length + e;
}

export function seriesRef(context: MarketContext, series: number): SeriesRef {
  const stocks = context.layout.instrumentIds.length;
  const indices = context.indices.ids.length;
  if (!Number.isInteger(series) || series < 0 || series >= seriesCount(context)) {
    throw new RangeError(`series: unknown series ${series}`);
  }
  if (series < stocks) {
    return { kind: 'stock', index: series };
  }
  if (series < stocks + indices) {
    return { kind: 'index', index: series - stocks };
  }
  if (series < stocks + 2 * indices) {
    return { kind: 'total-return', index: series - stocks - indices };
  }
  return { kind: 'etf', index: series - stocks - 2 * indices };
}

/** Stable series IDs: company IDs, index IDs, `<index id>-tr` for total return indices, ETF IDs. */
export function seriesIds(context: MarketContext): string[] {
  return [
    ...context.layout.instrumentIds,
    ...context.indices.ids,
    ...context.indices.ids.map((id) => `${id}-tr`),
    ...context.etfs.ids,
  ];
}
