import { isIndicatorSpec } from '@app/analysis/domain/indicator-logic';
import { IndicatorSpec } from '@app/analysis/domain/models/indicator.model';
import { CHART_COLORS, ChartColor } from '@app/charts/ui/models/chart-color.model';
import { PRICE_CHART_TYPES } from '@app/charts/ui/price-chart/price-chart.model';
import { MoversPayload } from '@app/engine/data-access/service/engine-service.model';
import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import { heatLevel } from '@app/market/domain/heatmap-logic';
import { CHART_RANGES } from '@app/market/domain/models/chart.model';
import { Instrument } from '@app/market/domain/models/instrument.model';
import {
  ScreenerCriteria,
  ScreenerRow,
  ScreenerSort,
  ScreenerSortKey,
} from '@app/market/domain/models/screener.model';
import { overviewSparklinePoints } from '@app/market/domain/overview-sparkline-logic';
import { PERFORMANCE_PERIODS, PerformancePeriod } from '@app/market/domain/performance-logic';
import { DEFAULT_SCREENER_SORT } from '@app/market/domain/screener-logic';
import { ChartIndicator } from '@app/market/ui/models/chart-indicator.model';
import {
  MarketMoversViewModel,
  MoverView,
  OverviewIndexView,
} from '@app/market/ui/models/overview-view.model';
import {
  SCREENER_FILTER_DIMENSIONS,
  ScreenerFilter,
  ScreenerRange,
  ScreenerRowView,
} from '@app/market/ui/models/screener-view.model';
import { WatchlistRowView } from '@app/market/ui/models/watchlist-view.model';

import {
  ChartSettings,
  MAX_CHART_INDICATORS,
  OverviewSparklines,
  QuoteSubscriptions,
  SCREENER_ROW_BUFFER,
} from './market.model';

/** The series of a subscription, sorted and without duplicates. */
export function normalizeSeries(series: readonly number[]): number[] {
  return [...new Set(series)].sort((a, b) => a - b);
}

export function sameSeries(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((series, index) => series === b[index]);
}

/** Two watchlists with the same IDs in the same order. */
export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** Every series that at least one subscription watches. */
export function subscribedSeries(subscriptions: QuoteSubscriptions): Set<number> {
  return new Set(Object.values(subscriptions).flat());
}

/** The newest quote per series of several packages, in the order of first arrival. */
export function latestQuotes(packages: readonly (readonly SeriesQuote[])[]): SeriesQuote[] {
  const latest = new Map<number, SeriesQuote>();
  for (const quotes of packages) {
    for (const quote of quotes) {
      latest.set(quote.series, quote);
    }
  }
  return [...latest.values()];
}

/** Defaults of the chart without stored settings. */
export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  range: '1d',
  chartType: 'candles',
  indicators: [],
};

const INDICATOR_ID = /^i[1-9]\d*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isChartColor(value: unknown): value is ChartColor {
  return CHART_COLORS.some((color) => color === value);
}

/**
 * The settings of `pgo.ui.chart` (TS §9.3) from a stored value: every missing or invalid field
 * falls back to its default on its own; invalid indicators and repeated ids are dropped, at most
 * `MAX_CHART_INDICATORS` stay. An indicator without a valid colour gets the first colour the
 * indicators before it leave free, as it did when it was added.
 */
export function parseChartSettings(data: unknown): ChartSettings {
  if (!isRecord(data)) {
    return DEFAULT_CHART_SETTINGS;
  }
  const { range, chartType, indicators } = data;
  const valid: ChartIndicator[] = [];
  if (Array.isArray(indicators)) {
    for (const indicator of indicators) {
      if (!isRecord(indicator) || valid.length >= MAX_CHART_INDICATORS) {
        continue;
      }
      const { id, spec, color } = indicator;
      if (
        typeof id === 'string' &&
        INDICATOR_ID.test(id) &&
        isIndicatorSpec(spec) &&
        !valid.some((other) => other.id === id)
      ) {
        valid.push({
          id,
          spec: copySpec(spec),
          color: isChartColor(color) ? color : nextIndicatorColor(valid),
        });
      }
    }
  }
  return {
    range: CHART_RANGES.find((known) => known === range) ?? DEFAULT_CHART_SETTINGS.range,
    chartType:
      PRICE_CHART_TYPES.find((known) => known === chartType) ?? DEFAULT_CHART_SETTINGS.chartType,
    indicators: valid,
  };
}

function copySpec(spec: IndicatorSpec): IndicatorSpec {
  return spec.kind === 'bollinger'
    ? { kind: spec.kind, period: spec.period, multiplier: spec.multiplier }
    : { kind: spec.kind, period: spec.period };
}

/** The next free id `i<n>`: one above the highest in use. */
export function nextIndicatorId(indicators: readonly ChartIndicator[]): string {
  const highest = indicators.reduce((max, { id }) => Math.max(max, Number(id.slice(1)) || 0), 0);
  return `i${highest + 1}`;
}

/**
 * The colour a new indicator starts with (TS §11.7): the first chart colour no indicator uses;
 * when all are in use, the first one.
 */
export function nextIndicatorColor(indicators: readonly ChartIndicator[]): ChartColor {
  return (
    CHART_COLORS.find((color) => !indicators.some((indicator) => indicator.color === color)) ??
    CHART_COLORS[0]
  );
}

/**
 * Adds an indicator (`id` `null`, with the next id; ignored at `MAX_CHART_INDICATORS`) or changes
 * the parameters and the colour of an existing one, which keeps its id. Several indicators may
 * share a colour.
 */
export function withChartIndicator(
  indicators: readonly ChartIndicator[],
  id: string | null,
  spec: IndicatorSpec,
  color: ChartColor,
): readonly ChartIndicator[] {
  if (id === null) {
    return indicators.length >= MAX_CHART_INDICATORS
      ? indicators
      : [...indicators, { id: nextIndicatorId(indicators), spec, color }];
  }
  return indicators.map((indicator) =>
    indicator.id === id ? { ...indicator, spec, color } : indicator,
  );
}

/** The screener without search, filters or a chosen sort. */
export const DEFAULT_SCREENER_FILTER: ScreenerFilter = {
  search: '',
  assetClasses: [],
  regions: [],
  countries: [],
  sectors: [],
  industries: [],
  sizes: [],
  styles: [],
  dividendYield: {},
  sort: DEFAULT_SCREENER_SORT,
};

/** The query of a filter (TS §8.2): only what filters, the search trimmed. */
export function screenerCriteria(filter: ScreenerFilter): ScreenerCriteria {
  const criteria: ScreenerCriteria = { sort: filter.sort };
  const search = filter.search.trim();
  if (search !== '') {
    criteria.search = search;
  }
  for (const dimension of SCREENER_FILTER_DIMENSIONS) {
    const values = filter[dimension];
    if (values.length > 0) {
      (criteria as Record<string, unknown>)[dimension] = [...values];
    }
  }
  const { min, max } = filter.dividendYield;
  if (min !== undefined || max !== undefined) {
    criteria.dividendYield = {
      ...(min === undefined ? {} : { min }),
      ...(max === undefined ? {} : { max }),
    };
  }
  return criteria;
}

/** Whether a filter differs from the default in more than the sort. */
export function isScreenerFiltered(filter: ScreenerFilter): boolean {
  return (
    filter.search.trim() !== '' ||
    SCREENER_FILTER_DIMENSIONS.some((dimension) => filter[dimension].length > 0) ||
    filter.dividendYield.min !== undefined ||
    filter.dividendYield.max !== undefined
  );
}

/**
 * The sort after a click on a column (as in the bank comparison): the same column turns the
 * direction around, another one starts with names ascending and figures descending.
 */
export function nextScreenerSort(sort: ScreenerSort, key: ScreenerSortKey): ScreenerSort {
  if (sort.key === key) {
    return { key, direction: sort.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { key, direction: key === 'name' ? 'asc' : 'desc' };
}

/** The period of the performance column: the sorted one, else one year. */
export function performancePeriodOf(sort: ScreenerSort): PerformancePeriod {
  return PERFORMANCE_PERIODS.find((period) => period === sort.key) ?? 'y1';
}

/** The series whose quotes the screener watches: the rendered rows and a buffer around them. */
export function screenerWindowSeries(
  rows: readonly ScreenerRow[],
  range: ScreenerRange,
  buffer = SCREENER_ROW_BUFFER,
): number[] {
  const start = Math.max(0, range.start - buffer);
  const end = Math.min(rows.length, Math.max(range.end, range.start) + buffer);
  const series: number[] = [];
  for (let index = start; index < end; index++) {
    series.push(rows[index].series);
  }
  return series;
}

/**
 * The rows of the screener list: master data, the figures of the query and – where a quote of a
 * watched row arrived since – its live price and change.
 */
export function screenerRowViews(
  rows: readonly ScreenerRow[],
  quotes: Readonly<Record<number, SeriesQuote | undefined>>,
  instruments: ReadonlyMap<number, Instrument>,
  period: PerformancePeriod,
): ScreenerRowView[] {
  const views: ScreenerRowView[] = [];
  for (const row of rows) {
    const instrument = instruments.get(row.series);
    if (instrument === undefined) {
      continue;
    }
    const quote = quotes[row.series];
    views.push({
      id: row.id,
      series: row.series,
      name: instrument.name,
      ticker: instrument.ticker,
      kind: instrument.kind,
      last: quote?.last ?? row.last,
      changeRatio: quote?.changeRatio ?? row.changeRatio,
      sparkline: row.sparkline,
      performance: row.performance[period],
      dividendYield: row.dividendYield,
    });
  }
  return views;
}

/** The indices of the overview in their order, with quote and the line of the day. */
export function overviewIndexViews(
  series: readonly number[],
  instruments: ReadonlyMap<number, Instrument>,
  quotes: Readonly<Record<number, SeriesQuote | undefined>>,
  sparklines: OverviewSparklines,
): OverviewIndexView[] {
  return series.flatMap((index) => {
    const instrument = instruments.get(index);
    if (instrument === undefined) {
      return [];
    }
    const sparkline = sparklines[index];
    return [
      {
        instrument,
        quote: quotes[index] ?? null,
        sparkline:
          sparkline === undefined || sparkline.loading
            ? []
            : overviewSparklinePoints(sparkline.candles),
      },
    ];
  });
}

/**
 * Gainers, losers and the sector heat map: quotes with their instruments (unknown series are left
 * out) and the sector tiles with their level and the sector's price index.
 */
export function moversViewModel(
  movers: MoversPayload,
  instruments: ReadonlyMap<number, Instrument>,
): MarketMoversViewModel {
  const withInstrument = (quotes: readonly SeriesQuote[]): MoverView[] =>
    quotes.flatMap((quote) => {
      const instrument = instruments.get(quote.series);
      return instrument === undefined ? [] : [{ instrument, quote }];
    });
  return {
    gainers: withInstrument(movers.gainers),
    losers: withInstrument(movers.losers),
    sectors: movers.sectors.map(({ sectorId, quote }) => ({
      sectorId,
      instrumentId: instruments.get(quote.series)?.id ?? null,
      changeRatio: quote.changeRatio,
      level: heatLevel(quote.changeRatio),
    })),
  };
}

/**
 * The rows of the watchlist in its order: price and change from the live quote, else from the
 * screener figures; IDs whose instrument is unknown are left out.
 */
export function watchlistRowViews(
  ids: readonly string[],
  instruments: Readonly<Record<string, Instrument | undefined>>,
  quotes: Readonly<Record<number, SeriesQuote | undefined>>,
  rows: readonly ScreenerRow[],
): WatchlistRowView[] {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const instrument = instruments[id];
    if (instrument === undefined) {
      return [];
    }
    const quote = quotes[instrument.series];
    const row = rowsById.get(id);
    return [
      {
        id,
        series: instrument.series,
        name: instrument.name,
        ticker: instrument.ticker,
        kind: instrument.kind,
        last: quote?.last ?? row?.last ?? null,
        changeRatio: quote?.changeRatio ?? row?.changeRatio ?? null,
        sparkline: row?.sparkline ?? [],
      },
    ];
  });
}
