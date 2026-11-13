import { Instrument } from './models/instrument.model';
import {
  ScreenerCriteria,
  ScreenerMetrics,
  ScreenerSort,
  ScreenerSortKey,
} from './models/screener.model';

/** Sorting without a choice: by name, ascending. */
export const DEFAULT_SCREENER_SORT: ScreenerSort = { key: 'name', direction: 'asc' };

const NAME_COLLATOR = new Intl.Collator('de', { sensitivity: 'base' });

/**
 * Search of the screener (TS §8.2): the trimmed text as a part of name, ticker or ISIN, ignoring
 * case; an empty text matches everything.
 */
export function matchesSearch(instrument: Instrument, search: string | undefined): boolean {
  const text = (search ?? '').trim().toLowerCase();
  if (text === '') {
    return true;
  }
  return [instrument.name, instrument.ticker, instrument.isin ?? ''].some((field) =>
    field.toLowerCase().includes(text),
  );
}

/** A dimension without values doesn't filter; an instrument without the attribute never matches. */
function matchesAny<T>(value: T | null, wanted: readonly T[] | undefined): boolean {
  return wanted === undefined || wanted.length === 0 || (value !== null && wanted.includes(value));
}

/**
 * Search and the master data filters (TS §5.3, US-MK-02): AND between the dimensions, OR within one.
 * The dividend yield range needs the metrics (`matchesMetrics`).
 */
export function matchesInstrument(instrument: Instrument, criteria: ScreenerCriteria): boolean {
  return (
    matchesSearch(instrument, criteria.search) &&
    matchesAny(instrument.kind, criteria.assetClasses) &&
    matchesAny(instrument.regionId, criteria.regions) &&
    matchesAny(instrument.countryId, criteria.countries) &&
    matchesAny(instrument.sectorId, criteria.sectors) &&
    matchesAny(instrument.industryId, criteria.industries) &&
    matchesAny(instrument.size, criteria.sizes) &&
    matchesAny(instrument.style, criteria.styles)
  );
}

/** Dividend yield range, bounds inclusive; without a yield (indices) a set range never matches. */
export function matchesMetrics(metrics: ScreenerMetrics, criteria: ScreenerCriteria): boolean {
  const range = criteria.dividendYield;
  if (range === undefined || (range.min === undefined && range.max === undefined)) {
    return true;
  }
  const value = metrics.dividendYield;
  return (
    value !== null &&
    (range.min === undefined || value >= range.min) &&
    (range.max === undefined || value <= range.max)
  );
}

function finiteOrNull(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

function metricOf(metrics: ScreenerMetrics, key: Exclude<ScreenerSortKey, 'name'>): number | null {
  switch (key) {
    case 'changeRatio':
      return metrics.changeRatio;
    case 'dividendYield':
      return metrics.dividendYield;
    default:
      return metrics.performance[key];
  }
}

/**
 * Sorts the matches (TS §8.2): by name with the German collation, or by a metric. Missing values
 * (`null`, not finite) come last in both directions; ties keep the series order.
 */
export function sortScreenerEntries<T extends { instrument: Instrument; metrics: ScreenerMetrics }>(
  entries: readonly T[],
  sort: ScreenerSort = DEFAULT_SCREENER_SORT,
): T[] {
  const sign = sort.direction === 'asc' ? 1 : -1;
  const key = sort.key;
  return [...entries].sort((a, b) => {
    let order: number;
    if (key === 'name') {
      order = sign * NAME_COLLATOR.compare(a.instrument.name, b.instrument.name);
    } else {
      const x = finiteOrNull(metricOf(a.metrics, key));
      const y = finiteOrNull(metricOf(b.metrics, key));
      order = x === null || y === null ? Number(x === null) - Number(y === null) : sign * (x - y);
    }
    return order !== 0 ? order : a.instrument.series - b.instrument.series;
  });
}
