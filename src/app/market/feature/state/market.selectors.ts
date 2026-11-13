import { getRouterSelectors } from '@ngrx/router-store';
import { createFeatureSelector, createSelector } from '@ngrx/store';

import { Instrument, INSTRUMENT_KINDS } from '@app/market/domain/models/instrument.model';

import { InstrumentQuote, InstrumentsByKind } from './market.model';
import {
  instrumentsAdapter,
  MARKET_FEATURE_KEY,
  MarketState,
  quotesAdapter,
} from './market.reducer';

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
