import { isIndicatorSpec } from '@app/analysis/domain/indicator-logic';
import { IndicatorSpec } from '@app/analysis/domain/models/indicator.model';
import { CHART_COLORS, ChartColor } from '@app/charts/ui/models/chart-color.model';
import { PRICE_CHART_TYPES } from '@app/charts/ui/price-chart/price-chart.model';
import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import { CHART_RANGES } from '@app/market/domain/models/chart.model';

import { ChartIndicator } from '@app/market/ui/models/chart-indicator.model';

import { ChartSettings, MAX_CHART_INDICATORS, QuoteSubscriptions } from './market.model';

/** The series of a subscription, sorted and without duplicates. */
export function normalizeSeries(series: readonly number[]): number[] {
  return [...new Set(series)].sort((a, b) => a - b);
}

export function sameSeries(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((series, index) => series === b[index]);
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

/** Type guard for a stored indicator: `i<n>` id, valid spec, a chart colour. */
export function isChartIndicator(value: unknown): value is ChartIndicator {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    INDICATOR_ID.test(value['id']) &&
    isIndicatorSpec(value['spec']) &&
    CHART_COLORS.some((color) => color === value['color'])
  );
}

/**
 * The settings of `pgo.ui.chart` (TS §9.3) from a stored value: every missing or invalid field
 * falls back to its default on its own; invalid indicators and repeated ids are dropped, at most
 * `MAX_CHART_INDICATORS` stay.
 */
export function parseChartSettings(data: unknown): ChartSettings {
  if (!isRecord(data)) {
    return DEFAULT_CHART_SETTINGS;
  }
  const { range, chartType, indicators } = data;
  const valid: ChartIndicator[] = [];
  if (Array.isArray(indicators)) {
    for (const indicator of indicators) {
      if (
        isChartIndicator(indicator) &&
        valid.length < MAX_CHART_INDICATORS &&
        !valid.some((other) => other.id === indicator.id)
      ) {
        valid.push({ id: indicator.id, spec: copySpec(indicator.spec), color: indicator.color });
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

/** The first chart colour no indicator uses; when all are taken, they repeat in order. */
export function nextIndicatorColor(indicators: readonly ChartIndicator[]): ChartColor {
  return (
    CHART_COLORS.find((color) => !indicators.some((indicator) => indicator.color === color)) ??
    CHART_COLORS[indicators.length % CHART_COLORS.length]
  );
}

/**
 * Adds an indicator (`id` `null`, with the next id and colour; ignored at `MAX_CHART_INDICATORS`)
 * or changes the parameters of an existing one, which keeps its id and colour.
 */
export function withChartIndicator(
  indicators: readonly ChartIndicator[],
  id: string | null,
  spec: IndicatorSpec,
): readonly ChartIndicator[] {
  if (id === null) {
    return indicators.length >= MAX_CHART_INDICATORS
      ? indicators
      : [
          ...indicators,
          { id: nextIndicatorId(indicators), spec, color: nextIndicatorColor(indicators) },
        ];
  }
  return indicators.map((indicator) => (indicator.id === id ? { ...indicator, spec } : indicator));
}
