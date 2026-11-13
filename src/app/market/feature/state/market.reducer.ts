import { createEntityAdapter, EntityAdapter, EntityState } from '@ngrx/entity';
import { Action, createReducer, on } from '@ngrx/store';

import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import {
  applyLiveCandle,
  liveCandleStep,
  prependCandles,
} from '@app/market/domain/chart-view-logic';
import { ChartRange } from '@app/market/domain/models/chart.model';
import { Instrument } from '@app/market/domain/models/instrument.model';

import * as MarketActions from './market.actions';
import { InstrumentChartState, MarketMoversView, QuoteSubscriptions } from './market.model';
import { normalizeSeries, sameSeries, subscribedSeries } from './market.utils';

export const MARKET_FEATURE_KEY = 'market';

/**
 * Market data of the loaded player (TS §11.3): master data of all series, the quotes of the
 * subscribed series, the movers while a view watches them and the chart of the instrument page
 * (AP 4.2). Screener filters and watchlist follow in AP 4.4.
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
  error?: unknown;
}

export const instrumentsAdapter: EntityAdapter<Instrument> = createEntityAdapter<Instrument>();
export const quotesAdapter: EntityAdapter<SeriesQuote> = createEntityAdapter<SeriesQuote>({
  selectId: (quote) => quote.series,
});

export const initialChartState: InstrumentChartState = {
  range: '1d',
  chartType: 'candles',
  day: null,
  generation: 0,
  candles: [],
  hasOlder: false,
  loading: false,
  reloading: false,
  loadingOlder: false,
};

export const initialMarketState: MarketState = {
  instruments: instrumentsAdapter.getInitialState(),
  instrumentsLoaded: false,
  quotes: quotesAdapter.getInitialState(),
  quoteSubscriptions: {},
  moversSubscriptions: [],
  movers: null,
  chart: initialChartState,
};

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
 * A new start block of the chart: the next generation without the loaded candles; period and chart
 * type stay. `loading` shows the placeholder until the block arrives.
 */
function newChart(
  chart: InstrumentChartState,
  changes: Partial<Pick<InstrumentChartState, 'range' | 'day' | 'loading'>>,
): InstrumentChartState {
  return {
    ...initialChartState,
    range: chart.range,
    chartType: chart.chartType,
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

export function marketReducer(state: MarketState | undefined, action: Action): MarketState {
  return reducer(state, action);
}
