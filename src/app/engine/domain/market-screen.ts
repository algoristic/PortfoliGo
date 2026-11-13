import { dayIndex, minuteOfDay } from '@app/clock/domain/calendar-logic';
import { Tick } from '@app/clock/domain/models/time.model';
import { DailyCloses } from '@app/market/domain/daily-closes';
import { MarketContext } from '@app/market/domain/market-context';
import { Instrument } from '@app/market/domain/models/instrument.model';
import {
  ScreenerCriteria,
  ScreenerMetrics,
  ScreenerRow,
} from '@app/market/domain/models/screener.model';
import {
  dividendYield,
  marketDaysEndingAt,
  PERFORMANCE_MONTHS,
  PERFORMANCE_PERIODS,
  PerformancePeriod,
  performanceReferenceDay,
  relativeChange,
  SPARKLINE_CLOSES,
  trailingDividendDays,
} from '@app/market/domain/performance-logic';
import {
  matchesInstrument,
  matchesMetrics,
  sortScreenerEntries,
} from '@app/market/domain/screener-logic';
import { indexSeries } from '@app/market/domain/series';
import { World } from '@app/world/domain/models/world.model';

import { MarketMovers } from './models/market-movers.model';
import { PricePort } from './models/price-port.model';
import { SeriesQuote } from './models/series-quote.model';
import { referenceCloseTick, seriesQuote, seriesSession } from './series-quote';

/** Gainers and losers per list (US-MK-01). */
export const MOVERS_COUNT = 5;

export interface ScreenerSources {
  context: MarketContext;
  /** Master data of all series (`instrumentCatalog`). */
  catalog: readonly Instrument[];
  prices: PricePort;
  closes: DailyCloses;
}

export interface ScreenedInstruments {
  total: number;
  rows: ScreenerRow[];
}

interface Candidate {
  instrument: Instrument;
  quote: SeriesQuote;
  /** Market day of the quote's previous close, where the sparkline's closes end. */
  previousCloseDay: number;
}

/**
 * The screener at `now` (TS §8.2, US-MK-02): search and master data filters, figures of the
 * matches (change as in the quote, performance from daily closes, trailing dividend yield), the
 * yield range, sorting and a sparkline per row. Long periods come from the support points
 * (`DailyCloses`), never from minute curves; nothing after `now` is read (TS §4.5, rule 7).
 */
export function screenInstruments(
  sources: ScreenerSources,
  criteria: ScreenerCriteria,
  now: Tick,
): ScreenedInstruments {
  const { context, catalog, prices, closes } = sources;
  const today = dayIndex(now);
  const candidates: Candidate[] = catalog
    .filter((instrument) => matchesInstrument(instrument, criteria))
    .map((instrument) => {
      const session = seriesSession(context, instrument.series);
      return {
        instrument,
        quote: seriesQuote(context, prices, instrument.series, now),
        previousCloseDay: dayIndex(referenceCloseTick(session, now)),
      };
    });

  const sparklineDays = new Map<number, number[]>();
  for (const { previousCloseDay } of candidates) {
    if (!sparklineDays.has(previousCloseDay)) {
      sparklineDays.set(previousCloseDay, marketDaysEndingAt(previousCloseDay, SPARKLINE_CLOSES));
    }
  }
  const referenceDays = {} as Record<PerformancePeriod, number | null>;
  for (const period of PERFORMANCE_PERIODS) {
    referenceDays[period] = performanceReferenceDay(today, PERFORMANCE_MONTHS[period]);
  }
  const dividendDays = trailingDividendDays(today);
  const closeDays = [
    ...[...sparklineDays.values()].flat(),
    ...Object.values(referenceDays).filter((day): day is number => day !== null),
  ];
  if (candidates.length > 0) {
    closes.prepare(closeDays, dividendDays);
  }

  const minute = minuteOfDay(now);
  const entries = candidates.map(({ instrument, quote, previousCloseDay }) => {
    const { series } = instrument;
    const performance = {} as Record<PerformancePeriod, number | null>;
    for (const period of PERFORMANCE_PERIODS) {
      const day = referenceDays[period];
      performance[period] =
        day === null ? null : relativeChange(quote.last, closes.close(series, day));
    }
    let yieldValue: number | null = null;
    if (instrument.kind !== 'index') {
      // The ex-date of today counts from the open, where the price is marked down (TS §6.5).
      const opened = minute >= seriesSession(context, series).open;
      let cents = 0;
      for (const day of dividendDays) {
        if (day < today || opened) {
          cents += closes.dividendCents(series, day);
        }
      }
      yieldValue = dividendYield(cents, quote.last);
    }
    const metrics: ScreenerMetrics = {
      changeRatio: quote.changeRatio,
      performance,
      dividendYield: yieldValue,
    };
    const sparkline = (sparklineDays.get(previousCloseDay) ?? []).map((day) =>
      closes.close(series, day),
    );
    sparkline.push(quote.last);
    return { instrument, metrics, last: quote.last, sparkline };
  });

  const matches = sortScreenerEntries(
    entries.filter(({ metrics }) => matchesMetrics(metrics, criteria)),
    criteria.sort,
  );
  return {
    total: matches.length,
    rows: matches.map(({ instrument, metrics, last, sparkline }) => ({
      id: instrument.id,
      series: instrument.series,
      last,
      ...metrics,
      sparkline,
    })),
  };
}

/**
 * Gainers and losers among `quotes` (TS §8.4): the `count` largest positive and negative changes,
 * ties in series order. Shares without a change are in neither list.
 */
export function rankMovers(
  quotes: readonly SeriesQuote[],
  count: number = MOVERS_COUNT,
): Pick<MarketMovers, 'gainers' | 'losers'> {
  const bySeries = (a: SeriesQuote, b: SeriesQuote): number => a.series - b.series;
  const gainers = quotes
    .filter(({ changeRatio }) => changeRatio > 0)
    .sort((a, b) => b.changeRatio - a.changeRatio || bySeries(a, b))
    .slice(0, count);
  const losers = quotes
    .filter(({ changeRatio }) => changeRatio < 0)
    .sort((a, b) => a.changeRatio - b.changeRatio || bySeries(a, b))
    .slice(0, count);
  return { gainers, losers };
}

/** Gainers, losers and sector indices of the day at `now` (TS §8.3, US-MK-01). */
export function marketMovers(
  world: World,
  context: MarketContext,
  prices: PricePort,
  now: Tick,
  count: number = MOVERS_COUNT,
): MarketMovers {
  const stockQuotes = context.layout.instrumentIds.map((_id, i) =>
    seriesQuote(context, prices, i, now),
  );
  const sectors: MarketMovers['sectors'] = [];
  world.indices.forEach((index) => {
    if (index.kind === 'sector' && index.sectorId !== null) {
      const x = context.indices.ids.indexOf(index.id);
      sectors.push({
        sectorId: index.sectorId,
        quote: seriesQuote(context, prices, indexSeries(context, x), now),
      });
    }
  });
  return { ...rankMovers(stockQuotes, count), sectors };
}
