import { getRouterSelectors } from '@ngrx/router-store';
import { createFeatureSelector, createSelector } from '@ngrx/store';

import { dayIndex, dayStartTick, GAME_START_TICK } from '@app/clock/domain/calendar-logic';
import { selectExchanges, selectTick } from '@app/clock/feature/state/clock.selectors';
import {
  CHART_RANGE_INTERVALS,
  nextChartDay,
  previousChartDay,
  shownChartDay,
} from '@app/market/domain/chart-view-logic';
import { Instrument, INSTRUMENT_KINDS } from '@app/market/domain/models/instrument.model';
import { MAX_WATCHLIST_LENGTH } from '@app/market/domain/models/watchlist.model';
import { marketDayOnOrBefore } from '@app/market/domain/performance-logic';
import { InstrumentHeadView } from '@app/market/ui/models/instrument-view.model';
import {
  MarketMoversViewModel,
  OverviewIndexView,
} from '@app/market/ui/models/overview-view.model';
import { ScreenerRowView } from '@app/market/ui/models/screener-view.model';
import { WatchlistMembership, WatchlistRowView } from '@app/market/ui/models/watchlist-view.model';

import { instrumentDetailView, instrumentHeadView } from './instrument-view.utils';
import {
  ChartSettings,
  ChartSubscription,
  InstrumentChartView,
  InstrumentDetailView,
  InstrumentQuote,
  InstrumentsByKind,
  ScreenerView,
} from './market.model';
import {
  instrumentsAdapter,
  MARKET_FEATURE_KEY,
  MarketState,
  quotesAdapter,
} from './market.reducer';
import {
  isScreenerFiltered,
  moversViewModel,
  overviewIndexViews,
  performancePeriodOf,
  screenerCriteria,
  screenerRowViews,
  screenerWindowSeries,
  watchlistRowViews,
} from './market.utils';

const selectState = createFeatureSelector<MarketState>(MARKET_FEATURE_KEY);
const instrumentSelectors = instrumentsAdapter.getSelectors();
const quoteSelectors = quotesAdapter.getSelectors();
const { selectRouteParam } = getRouterSelectors();

const selectInstrumentsState = createSelector(selectState, (state) => state.instruments);
const selectQuotesState = createSelector(selectState, (state) => state.quotes);

/** All series in series order: shares, price indices, total return indices, ETFs. */
export const selectInstruments = createSelector(
  selectInstrumentsState,
  instrumentSelectors.selectAll,
);
export const selectInstrumentEntities = createSelector(
  selectInstrumentsState,
  instrumentSelectors.selectEntities,
);
export const selectInstrumentsLoaded = createSelector(
  selectState,
  (state) => state.instrumentsLoaded,
);
export const selectQuoteEntities = createSelector(selectQuotesState, quoteSelectors.selectEntities);
export const selectQuoteSubscriptions = createSelector(
  selectState,
  (state) => state.quoteSubscriptions,
);
export const selectMoversWanted = createSelector(
  selectState,
  (state) => state.moversSubscriptions.length > 0,
);
export const selectMovers = createSelector(selectState, (state) => state.movers);

/** Instruments by series index, for views that get series from quotes or movers. */
export const selectInstrumentsBySeries = createSelector(
  selectInstruments,
  (instruments): ReadonlyMap<number, Instrument> =>
    new Map(instruments.map((instrument) => [instrument.series, instrument])),
);

export const selectInstrumentsByKind = createSelector(
  selectInstruments,
  (instruments): InstrumentsByKind =>
    Object.fromEntries(
      INSTRUMENT_KINDS.map((kind) => [
        kind,
        instruments.filter((instrument) => instrument.kind === kind),
      ]),
    ) as unknown as InstrumentsByKind,
);

/**
 * The indices of the markets page (US-MK-01): the price indices except the sector indices, whose
 * quotes come with the movers.
 */
export const selectOverviewIndexSeries = createSelector(selectInstruments, (instruments) =>
  instruments
    .filter(
      (instrument) =>
        instrument.kind === 'index' &&
        instrument.variant === 'price' &&
        instrument.indexKind !== 'sector',
    )
    .map((instrument) => instrument.series),
);

export const selectInstrumentById = (id: string) =>
  createSelector(selectInstrumentEntities, (entities) => entities[id] ?? null);

/** Quote of an instrument; `null` while the instrument is unknown. */
export const selectInstrumentQuote = (id: string) =>
  createSelector(
    selectInstrumentById(id),
    selectQuoteEntities,
    (instrument, quotes): InstrumentQuote | null =>
      instrument === null ? null : { instrument, quote: quotes[instrument.series] ?? null },
  );

export const selectRouteInstrumentId = selectRouteParam('instrumentId');

/** The instrument of `/game/:playerId/markets/:instrumentId`; `null` while unknown. */
export const selectRouteInstrument = createSelector(
  selectRouteInstrumentId,
  selectInstrumentEntities,
  (id, entities) => (id === undefined ? null : (entities[id] ?? null)),
);

export const selectRouteInstrumentQuote = createSelector(
  selectRouteInstrument,
  selectQuoteEntities,
  (instrument, quotes): InstrumentQuote | null =>
    instrument === null ? null : { instrument, quote: quotes[instrument.series] ?? null },
);

export const selectChart = createSelector(selectState, (state) => state.chart);

/** What `pgo.ui.chart` stores (TS §9.3). */
export const selectChartSettings = createSelector(
  selectChart,
  ({ range, chartType, indicators }): ChartSettings => ({ range, chartType, indicators }),
);

/** The chart subscription of the instrument page: live candles only while the block reaches now. */
export const selectChartSubscription = createSelector(selectChart, (chart): ChartSubscription => ({
  interval: CHART_RANGE_INTERVALS[chart.range],
  live: chart.day === null,
}));

/** Today's day index; changes once a day, so the chart view doesn't follow every clock tick. */
export const selectToday = createSelector(selectTick, (tick) => dayIndex(tick ?? GAME_START_TICK));

export const selectChartView = createSelector(
  selectChart,
  selectToday,
  (chart, today): InstrumentChartView => {
    const now = dayStartTick(today);
    const shownDay = shownChartDay(chart.day, chart.candles, now);
    return {
      range: chart.range,
      interval: CHART_RANGE_INTERVALS[chart.range],
      chartType: chart.chartType,
      indicators: chart.indicators,
      candles: chart.candles,
      lastCandle: chart.candles.at(-1) ?? null,
      loading: chart.loading,
      loadingOlder: chart.loadingOlder,
      failed: chart.error !== undefined && chart.candles.length === 0,
      live: chart.day === null,
      shownDay,
      shownDayTick: dayStartTick(shownDay),
      previousDay: previousChartDay(shownDay),
      nextDay: chart.day === null ? undefined : nextChartDay(chart.day, now),
      today,
    };
  },
);

/** The newest market day that has begun; the screener figures change with it. */
export const selectMarketDay = createSelector(selectToday, (today) => marketDayOnOrBefore(today));

export const selectOverviewSparklines = createSelector(
  selectState,
  (state) => state.overviewSparklines,
);

/** The indices of the markets page with quote and sparkline (US-MK-01). */
export const selectOverviewIndices = createSelector(
  selectOverviewIndexSeries,
  selectInstrumentsBySeries,
  selectQuoteEntities,
  selectOverviewSparklines,
  (series, instruments, quotes, sparklines): OverviewIndexView[] =>
    overviewIndexViews(series, instruments, quotes, sparklines),
);

/** Gainers, losers and sector heat map; `null` until the first movers event. */
export const selectMoversView = createSelector(
  selectMovers,
  selectInstrumentsBySeries,
  (movers, instruments): MarketMoversViewModel | null =>
    movers === null ? null : moversViewModel(movers, instruments),
);

export const selectScreener = createSelector(selectState, (state) => state.screener);
export const selectScreenerFilter = createSelector(selectScreener, (screener) => screener.filter);

/** The query of the current filter (TS §8.2). */
export const selectScreenerCriteria = createSelector(selectScreenerFilter, screenerCriteria);

export const selectScreenerView = createSelector(selectScreener, (screener): ScreenerView => ({
  filter: screener.filter,
  filtered: isScreenerFiltered(screener.filter),
  generation: screener.generation,
  loading: screener.loading,
  failed: screener.error !== undefined && screener.total === null,
  total: screener.total,
  performancePeriod: performancePeriodOf(screener.filter.sort),
}));

const selectScreenerRowsState = createSelector(selectScreener, (screener) => screener.rows);
const selectPerformancePeriod = createSelector(selectScreenerFilter, (filter) =>
  performancePeriodOf(filter.sort),
);

/** The rows of the screener list with the live quotes of the watched rows. */
export const selectScreenerRows = createSelector(
  selectScreenerRowsState,
  selectQuoteEntities,
  selectInstrumentsBySeries,
  selectPerformancePeriod,
  (rows, quotes, instruments, period): ScreenerRowView[] =>
    screenerRowViews(rows, quotes, instruments, period),
);

const selectScreenerRange = createSelector(selectScreener, (screener) => screener.range);

/** The series whose quotes the screener watches: rendered rows plus a buffer. */
export const selectScreenerWindowSeries = createSelector(
  selectScreenerRowsState,
  selectScreenerRange,
  (rows, range) => screenerWindowSeries(rows, range),
);

export const selectWatchlist = createSelector(selectState, (state) => state.watchlist);

/** The watchlist as shown: the requested list until it is confirmed, else the confirmed one. */
export const selectWatchlistIds = createSelector(
  selectWatchlist,
  (watchlist): readonly string[] => watchlist.requested ?? watchlist.ids ?? [],
);

/** The list arrived with the projection; changes before would replace an unknown list. */
export const selectWatchlistKnown = createSelector(
  selectWatchlist,
  (watchlist) => watchlist.ids !== null,
);

export const selectWatchlistMembership = createSelector(
  selectWatchlistIds,
  selectWatchlistKnown,
  (ids, known): WatchlistMembership => ({
    ids: new Set(ids),
    full: ids.length >= MAX_WATCHLIST_LENGTH,
    known,
  }),
);

/** The series whose quotes the watchlist tab watches, in list order. */
export const selectWatchlistSeries = createSelector(
  selectWatchlistIds,
  selectInstrumentEntities,
  (ids, instruments): number[] =>
    ids.flatMap((id) => {
      const instrument = instruments[id];
      return instrument === undefined ? [] : [instrument.series];
    }),
);

/** An instrument of the shown list has no screener figures yet (it was added since the query). */
export const selectWatchlistRowsMissing = createSelector(
  selectWatchlistIds,
  selectWatchlist,
  (ids, { rows }) => {
    const known = new Set(rows.map((row) => row.id));
    return ids.some((id) => !known.has(id));
  },
);

export const selectWatchlistRows = createSelector(
  selectWatchlistIds,
  selectInstrumentEntities,
  selectQuoteEntities,
  selectWatchlist,
  (ids, instruments, quotes, { rows }): WatchlistRowView[] =>
    watchlistRowViews(ids, instruments, quotes, rows),
);

/** The star of the instrument page: whether its instrument is on the watchlist. */
export const selectRouteInstrumentWatchlist = createSelector(
  selectRouteInstrument,
  selectWatchlistMembership,
  (instrument, { ids, full, known }) =>
    instrument === null ? null : { watched: ids.has(instrument.id), full, known },
);

export const selectInstrumentDetail = createSelector(
  selectState,
  (state) => state.instrumentDetail,
);

/**
 * The previous close of the shown instrument: it changes when a new session of the instrument
 * opens (then today's ex-dates join the dividend history, TS §6.5); `null` before the first quote.
 */
export const selectRouteInstrumentSession = createSelector(
  selectRouteInstrumentQuote,
  (shown) => shown?.quote?.previousClose ?? null,
);

/** The price head of the instrument page with the live quote and the trading status. */
export const selectInstrumentHead = createSelector(
  selectRouteInstrumentQuote,
  selectExchanges,
  selectTick,
  selectInstrumentDetail,
  (shown, exchanges, tick, detail): InstrumentHeadView | null =>
    shown === null
      ? null
      : instrumentHeadView(shown.instrument, shown.quote, exchanges, tick, detail),
);

/** Figures, profile, composition and dividends of the instrument page; no clock dependency. */
export const selectInstrumentDetailView = createSelector(
  selectRouteInstrument,
  selectInstrumentDetail,
  selectInstrumentEntities,
  (instrument, detail, entities): InstrumentDetailView =>
    instrumentDetailView(instrument, detail, entities),
);
