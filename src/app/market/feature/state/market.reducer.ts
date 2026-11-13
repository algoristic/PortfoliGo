import { createEntityAdapter, EntityAdapter, EntityState } from '@ngrx/entity';
import { Action, createReducer, on } from '@ngrx/store';

import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { Instrument } from '@app/market/domain/models/instrument.model';

import * as MarketActions from './market.actions';
import { MarketMoversView, QuoteSubscriptions } from './market.model';
import { normalizeSeries, sameSeries, subscribedSeries } from './market.utils';

export const MARKET_FEATURE_KEY = 'market';

/**
 * Market data of the loaded player (TS §11.3): master data of all series, the quotes of the
 * subscribed series and the movers while a view watches them. Screener filters, watchlist and
 * chart candles follow in AP 4.2 and AP 4.4.
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
  error?: unknown;
}

export const instrumentsAdapter: EntityAdapter<Instrument> = createEntityAdapter<Instrument>();
export const quotesAdapter: EntityAdapter<SeriesQuote> = createEntityAdapter<SeriesQuote>({
  selectId: (quote) => quote.series,
});

export const initialMarketState: MarketState = {
  instruments: instrumentsAdapter.getInitialState(),
  instrumentsLoaded: false,
  quotes: quotesAdapter.getInitialState(),
  quoteSubscriptions: {},
  moversSubscriptions: [],
  movers: null,
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
);

export function marketReducer(state: MarketState | undefined, action: Action): MarketState {
  return reducer(state, action);
}
