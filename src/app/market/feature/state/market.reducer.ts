import { createEntityAdapter, EntityAdapter, EntityState } from '@ngrx/entity';
import { Action, createReducer, on } from '@ngrx/store';

import * as BankingActions from '@app/banking/feature/state/banking.actions';
import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import {
  applyLiveCandle,
  liveCandleStep,
  prependCandles,
} from '@app/market/domain/chart-view-logic';
import { ChartRange } from '@app/market/domain/models/chart.model';
import { Instrument } from '@app/market/domain/models/instrument.model';
import { ScreenerRow } from '@app/market/domain/models/screener.model';
import {
  overviewSparklineCandles,
  overviewSparklineStep,
} from '@app/market/domain/overview-sparkline-logic';
import { ScreenerFilter, ScreenerFilterDimension } from '@app/market/ui/models/screener-view.model';
import { COUNTRIES, INDUSTRIES } from '@app/world/domain/taxonomy';

import * as MarketActions from './market.actions';
import {
  InstrumentChartState,
  MarketMoversView,
  OverviewSparkline,
  OverviewSparklines,
  QuoteSubscriptions,
  SCREENER_INITIAL_ROWS,
  ScreenerState,
  WatchlistState,
} from './market.model';
import {
  DEFAULT_CHART_SETTINGS,
  DEFAULT_SCREENER_FILTER,
  nextScreenerSort,
  normalizeSeries,
  sameIds,
  sameSeries,
  subscribedSeries,
  withChartIndicator,
} from './market.utils';

export const MARKET_FEATURE_KEY = 'market';

/**
 * Market data of the loaded player (TS §11.3): master data of all series, the quotes of the
 * subscribed series, the movers while a view watches them and the chart of the instrument page
 * (AP 4.2), the sparklines of the overview indices, the screener and the watchlist (AP 4.4).
 */
export interface MarketState {
  instruments: EntityState<Instrument>;
  instrumentsLoaded: boolean;
  /** Quotes by series; only of series that a subscription watches. */
  quotes: EntityState<SeriesQuote>;
  quoteSubscriptions: QuoteSubscriptions;
  /** Keys of the views that watch the movers. */
  moversSubscriptions: readonly string[];
  /** `null` while no view watches them or before their first event. */
  movers: MarketMoversView | null;
  chart: InstrumentChartState;
  /** Only while the markets page is open. */
  overviewSparklines: OverviewSparklines;
  screener: ScreenerState;
  watchlist: WatchlistState;
  error?: unknown;
}

export const instrumentsAdapter: EntityAdapter<Instrument> = createEntityAdapter<Instrument>();
export const quotesAdapter: EntityAdapter<SeriesQuote> = createEntityAdapter<SeriesQuote>({
  selectId: (quote) => quote.series,
});

export const initialChartState: InstrumentChartState = {
  ...DEFAULT_CHART_SETTINGS,
  day: null,
  generation: 0,
  candles: [],
  hasOlder: false,
  loading: false,
  reloading: false,
  loadingOlder: false,
};

export const initialScreenerState: ScreenerState = {
  filter: DEFAULT_SCREENER_FILTER,
  generation: 0,
  loading: false,
  rows: [],
  total: null,
  range: { start: 0, end: SCREENER_INITIAL_ROWS },
};

export const initialWatchlistState: WatchlistState = { ids: null, requested: null, rows: [] };

export const initialMarketState: MarketState = {
  instruments: instrumentsAdapter.getInitialState(),
  instrumentsLoaded: false,
  quotes: quotesAdapter.getInitialState(),
  quoteSubscriptions: {},
  moversSubscriptions: [],
  movers: null,
  chart: initialChartState,
  overviewSparklines: {},
  screener: initialScreenerState,
  watchlist: initialWatchlistState,
};

const COUNTRY_REGIONS = new Map(COUNTRIES.map((country) => [country.id, country.regionId]));
const INDUSTRY_SECTORS = new Map(INDUSTRIES.map((industry) => [industry.id, industry.sectorId]));

/** New subscriptions; quotes of series that no subscription watches any more are dropped. */
function withSubscriptions(state: MarketState, subscriptions: QuoteSubscriptions): MarketState {
  const watched = subscribedSeries(subscriptions);
  const stale = (state.quotes.ids as number[]).filter((series) => !watched.has(series));
  return {
    ...state,
    quoteSubscriptions: subscriptions,
    quotes: stale.length > 0 ? quotesAdapter.removeMany(stale, state.quotes) : state.quotes,
  };
}

/**
 * A new start block of the chart: the next generation without the loaded candles; period, chart
 * type and indicators stay. `loading` shows the placeholder until the block arrives.
 */
function newChart(
  chart: InstrumentChartState,
  changes: Partial<Pick<InstrumentChartState, 'range' | 'day' | 'loading'>>,
): InstrumentChartState {
  return {
    ...initialChartState,
    range: chart.range,
    chartType: chart.chartType,
    indicators: chart.indicators,
    generation: chart.generation + 1,
    loading: true,
    ...changes,
  };
}

/** The chart of `day` (1T); other periods switch to 1T, the same day keeps the state. */
function withChartDay(state: MarketState, day: number | null): MarketState {
  const { chart } = state;
  const range: ChartRange = '1d';
  if (chart.range === range && chart.day === day) {
    return state;
  }
  return { ...state, chart: newChart(chart, { range, day }) };
}

/** Changes the chart only for an answer of its current generation. */
function forGeneration(
  state: MarketState,
  generation: number,
  change: (chart: InstrumentChartState) => InstrumentChartState,
): MarketState {
  if (generation !== state.chart.generation) {
    return state;
  }
  const chart = change(state.chart);
  return chart === state.chart ? state : { ...state, chart };
}

function withSparkline(
  state: MarketState,
  series: number,
  change: (sparkline: OverviewSparkline | undefined) => OverviewSparkline | undefined,
): MarketState {
  const current = state.overviewSparklines[series];
  const next = change(current);
  return next === current || next === undefined
    ? state
    : { ...state, overviewSparklines: { ...state.overviewSparklines, [series]: next } };
}

/** A new filter starts a new query (next generation) at the top of the list. */
function withScreenerFilter(state: MarketState, filter: ScreenerFilter): MarketState {
  const { screener } = state;
  if (filter === screener.filter) {
    return state;
  }
  return {
    ...state,
    screener: {
      ...screener,
      filter,
      generation: screener.generation + 1,
      loading: true,
      range: initialScreenerState.range,
    },
  };
}

/**
 * The values of a list dimension, without duplicates. Countries outside chosen regions and
 * industries outside chosen sectors are dropped, because the filter no longer offers them.
 */
function withDimension(
  filter: ScreenerFilter,
  dimension: ScreenerFilterDimension,
  values: readonly string[],
): ScreenerFilter {
  const unique = [...new Set(values)];
  const current = filter[dimension] as readonly string[];
  if (unique.length === current.length && unique.every((value, i) => value === current[i])) {
    return filter;
  }
  const next = { ...filter, [dimension]: unique } as ScreenerFilter;
  if (dimension === 'regions' && unique.length > 0) {
    next.countries = next.countries.filter((country) =>
      unique.includes(COUNTRY_REGIONS.get(country) ?? ''),
    );
  }
  if (dimension === 'sectors' && unique.length > 0) {
    next.industries = next.industries.filter((industry) =>
      unique.includes(INDUSTRY_SECTORS.get(industry) ?? ''),
    );
  }
  return next;
}

/** Changes the screener only for an answer of its current generation. */
function forScreenerGeneration(
  state: MarketState,
  generation: number,
  change: (screener: ScreenerState) => ScreenerState,
): MarketState {
  return generation === state.screener.generation
    ? { ...state, screener: change(state.screener) }
    : state;
}

const reducer = createReducer(
  initialMarketState,
  // Nothing of the previous player stays when another one is entered or the game is left.
  on(SessionActions.enterGame, SessionActions.leaveGame, () => initialMarketState),
  on(MarketActions.retrievedInstruments, (state, { instruments }) => ({
    ...state,
    instruments: instrumentsAdapter.setAll(instruments, state.instruments),
    instrumentsLoaded: true,
    error: undefined,
  })),
  on(MarketActions.loadInstrumentsFailure, (state, { error }) => ({ ...state, error })),
  on(MarketActions.quotesSubscriptionChanged, (state, { key, series }) => {
    const next = normalizeSeries(series);
    const current = state.quoteSubscriptions[key];
    // The same set keeps its reference, so the effect keeps its subscription.
    if (current !== undefined && sameSeries(current, next)) {
      return state;
    }
    return withSubscriptions(state, { ...state.quoteSubscriptions, [key]: next });
  }),
  on(MarketActions.quotesSubscriptionEnded, (state, { key }) => {
    if (!(key in state.quoteSubscriptions)) {
      return state;
    }
    const { [key]: _ended, ...rest } = state.quoteSubscriptions;
    return withSubscriptions(state, rest);
  }),
  on(MarketActions.receivedQuotes, (state, { quotes }) => {
    // Quotes still on their way when their subscription ended don't come back.
    const watched = subscribedSeries(state.quoteSubscriptions);
    const wanted = quotes.filter((quote) => watched.has(quote.series));
    return wanted.length > 0
      ? { ...state, quotes: quotesAdapter.upsertMany(wanted, state.quotes) }
      : state;
  }),
  on(MarketActions.moversSubscriptionStarted, (state, { key }) =>
    state.moversSubscriptions.includes(key)
      ? state
      : { ...state, moversSubscriptions: [...state.moversSubscriptions, key] },
  ),
  on(MarketActions.moversSubscriptionEnded, (state, { key }) => {
    if (!state.moversSubscriptions.includes(key)) {
      return state;
    }
    const moversSubscriptions = state.moversSubscriptions.filter((other) => other !== key);
    return {
      ...state,
      moversSubscriptions,
      movers: moversSubscriptions.length > 0 ? state.movers : null,
    };
  }),
  on(MarketActions.receivedMovers, (state, { movers }) =>
    state.moversSubscriptions.length > 0 ? { ...state, movers } : state,
  ),
  // Every instrument starts live; period and chart type stay for the next instrument.
  on(MarketActions.enterInstrumentPage, (state) => ({
    ...state,
    chart: newChart(state.chart, { day: null }),
  })),
  on(MarketActions.leaveInstrumentPage, (state) => ({
    ...state,
    chart: newChart(state.chart, { day: null, loading: false }),
  })),
  on(MarketActions.clickedChartRange, (state, { range }) =>
    range === state.chart.range && state.chart.day === null
      ? state
      : { ...state, chart: newChart(state.chart, { range, day: null }) },
  ),
  on(MarketActions.clickedChartType, (state, { chartType }) => ({
    ...state,
    chart: { ...state.chart, chartType },
  })),
  // Read when the game is entered, before any chart loads.
  on(
    MarketActions.loadedChartSettings,
    (state, { settings: { range, chartType, indicators } }) => ({
      ...state,
      chart: { ...state.chart, range, chartType, indicators },
    }),
  ),
  on(MarketActions.submittedChartIndicator, (state, { id, spec }) => ({
    ...state,
    chart: { ...state.chart, indicators: withChartIndicator(state.chart.indicators, id, spec) },
  })),
  on(MarketActions.clickedRemoveChartIndicator, (state, { id }) => ({
    ...state,
    chart: {
      ...state.chart,
      indicators: state.chart.indicators.filter((indicator) => indicator.id !== id),
    },
  })),
  on(MarketActions.clickedChartDay, MarketActions.submittedChartDate, (state, { day }) =>
    withChartDay(state, day),
  ),
  on(MarketActions.retrievedChartCandles, (state, { generation, candles, hasOlder }) =>
    forGeneration(state, generation, (chart) => ({
      ...chart,
      candles,
      hasOlder,
      loading: false,
      reloading: false,
      error: undefined,
    })),
  ),
  on(MarketActions.loadChartCandlesFailure, (state, { generation, error }) =>
    forGeneration(state, generation, (chart) => ({
      ...chart,
      loading: false,
      reloading: false,
      error,
    })),
  ),
  on(MarketActions.scrolledToChartStart, (state) => {
    const { chart } = state;
    const busy = chart.loading || chart.reloading || chart.loadingOlder;
    return busy || !chart.hasOlder || chart.candles.length === 0
      ? state
      : { ...state, chart: { ...chart, loadingOlder: true } };
  }),
  on(MarketActions.retrievedOlderChartCandles, (state, { generation, candles, hasOlder }) =>
    forGeneration(state, generation, (chart) =>
      chart.loadingOlder
        ? {
            ...chart,
            // An empty block keeps the candles, so the chart doesn't ask again for the same block.
            candles: candles.length === 0 ? chart.candles : prependCandles(candles, chart.candles),
            hasOlder,
            loadingOlder: false,
          }
        : chart,
    ),
  ),
  on(MarketActions.loadOlderChartCandlesFailure, (state, { generation, error }) =>
    forGeneration(state, generation, (chart) => ({ ...chart, loadingOlder: false, error })),
  ),
  on(MarketActions.receivedLiveCandle, (state, { generation, live }) =>
    forGeneration(state, generation, (chart) => {
      if (chart.loading || chart.reloading) {
        return chart;
      }
      const step = liveCandleStep(chart.range, chart.candles, live);
      const candles = applyLiveCandle(chart.candles, live, step);
      return candles === chart.candles ? chart : { ...chart, candles };
    }),
  ),
  // The candles stay visible until the new block arrives.
  on(MarketActions.detectedChartGap, (state, { generation }) =>
    forGeneration(state, generation, (chart) =>
      chart.loading || chart.reloading
        ? chart
        : { ...chart, generation: chart.generation + 1, reloading: true, loadingOlder: false },
    ),
  ),
);

const screenerReducer = createReducer(
  initialMarketState,
  // The filter stays for the next visit; the rows load again.
  on(MarketActions.enterScreenerPage, (state) => ({
    ...state,
    screener: {
      ...initialScreenerState,
      filter: state.screener.filter,
      generation: state.screener.generation + 1,
      loading: true,
    },
  })),
  on(MarketActions.leaveScreenerPage, (state) => ({
    ...state,
    screener: {
      ...initialScreenerState,
      filter: state.screener.filter,
      generation: state.screener.generation + 1,
    },
  })),
  on(MarketActions.enteredScreenerSearch, (state, { search }) =>
    search === state.screener.filter.search
      ? state
      : withScreenerFilter(state, { ...state.screener.filter, search }),
  ),
  on(MarketActions.selectedScreenerFilter, (state, { dimension, values }) =>
    withScreenerFilter(state, withDimension(state.screener.filter, dimension, values)),
  ),
  on(MarketActions.submittedScreenerDividendYield, (state, { range }) => {
    const { min, max } = state.screener.filter.dividendYield;
    return range.min === min && range.max === max
      ? state
      : withScreenerFilter(state, {
          ...state.screener.filter,
          dividendYield: {
            ...(range.min === undefined ? {} : { min: range.min }),
            ...(range.max === undefined ? {} : { max: range.max }),
          },
        });
  }),
  on(MarketActions.clickedScreenerSort, (state, { key }) =>
    withScreenerFilter(state, {
      ...state.screener.filter,
      sort: nextScreenerSort(state.screener.filter.sort, key),
    }),
  ),
  // The sort stays.
  on(MarketActions.clickedResetScreenerFilter, (state) =>
    withScreenerFilter(state, { ...DEFAULT_SCREENER_FILTER, sort: state.screener.filter.sort }),
  ),
  on(MarketActions.scrolledScreener, (state, { range }) =>
    range.start === state.screener.range.start && range.end === state.screener.range.end
      ? state
      : { ...state, screener: { ...state.screener, range } },
  ),
  on(MarketActions.retrievedScreener, (state, { generation, result }) =>
    forScreenerGeneration(state, generation, (screener) => ({
      ...screener,
      rows: result.rows,
      total: result.total,
      loading: false,
      error: undefined,
    })),
  ),
  on(MarketActions.loadScreenerFailure, (state, { generation, error }) =>
    forScreenerGeneration(state, generation, (screener) => ({
      ...screener,
      loading: false,
      error,
    })),
  ),
);

const overviewReducer = createReducer(
  initialMarketState,
  on(MarketActions.enterMarketsPage, MarketActions.leaveMarketsPage, (state) =>
    Object.keys(state.overviewSparklines).length === 0
      ? state
      : { ...state, overviewSparklines: {} },
  ),
  on(MarketActions.retrievedOverviewSparkline, (state, { series, candles }) =>
    withSparkline(state, series, () => ({
      candles: overviewSparklineCandles(candles),
      loading: false,
    })),
  ),
  on(MarketActions.loadOverviewSparklineFailure, (state, { series }) =>
    withSparkline(state, series, (sparkline) => ({
      candles: sparkline?.candles ?? [],
      loading: false,
    })),
  ),
  on(MarketActions.receivedOverviewSparklineCandle, (state, { series, live }) =>
    withSparkline(state, series, (sparkline) => {
      if (sparkline === undefined || sparkline.loading) {
        return sparkline;
      }
      const step = overviewSparklineStep(sparkline.candles, live);
      const candles = applyLiveCandle(sparkline.candles, live, step);
      return candles === sparkline.candles ? sparkline : { ...sparkline, candles };
    }),
  ),
  on(MarketActions.detectedOverviewSparklineGap, (state, { series }) =>
    withSparkline(state, series, (sparkline) =>
      sparkline === undefined || sparkline.loading ? sparkline : { ...sparkline, loading: true },
    ),
  ),
);

/** Keeps the screener figures of the instruments still on the watchlist (shown or confirmed). */
function withWatchlistRows(
  watchlist: WatchlistState,
  rows: readonly ScreenerRow[],
): WatchlistState {
  const wanted = new Set([...(watchlist.requested ?? []), ...(watchlist.ids ?? [])]);
  return { ...watchlist, rows: rows.filter((row) => wanted.has(row.id)) };
}

const watchlistReducer = createReducer(
  initialMarketState,
  // A projection confirms the requested list once it carries it; a later request stays shown.
  on(BankingActions.receivedProjection, (state, { projection }) => {
    const part = projection.watchlist;
    if (part === undefined) {
      return state;
    }
    const { requested } = state.watchlist;
    return {
      ...state,
      watchlist: {
        ...state.watchlist,
        ids: part.ids,
        requested: requested !== null && sameIds(requested, part.ids) ? null : requested,
      },
    };
  }),
  on(MarketActions.requestedWatchlist, (state, { ids }) => ({
    ...state,
    watchlist: { ...state.watchlist, requested: ids },
  })),
  // The newest request failed: the confirmed list shows again. An older one that failed leaves the
  // newer request shown; it brings its own confirmation or failure.
  on(MarketActions.updateWatchlistFailure, (state, { ids }) =>
    state.watchlist.requested !== null && sameIds(state.watchlist.requested, ids)
      ? { ...state, watchlist: { ...state.watchlist, requested: null } }
      : state,
  ),
  on(MarketActions.enterWatchlistPage, MarketActions.leaveWatchlistPage, (state) =>
    state.watchlist.rows.length === 0
      ? state
      : { ...state, watchlist: { ...state.watchlist, rows: [] } },
  ),
  on(MarketActions.retrievedWatchlistRows, (state, { rows }) => ({
    ...state,
    watchlist: withWatchlistRows(state.watchlist, rows),
  })),
);

export function marketReducer(state: MarketState | undefined, action: Action): MarketState {
  return watchlistReducer(
    overviewReducer(screenerReducer(reducer(state, action), action), action),
    action,
  );
}
