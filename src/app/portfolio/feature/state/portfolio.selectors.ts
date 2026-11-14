import { createFeatureSelector, createSelector } from '@ngrx/store';

import { selectAccounts } from '@app/banking/feature/state/banking.selectors';
import {
  selectInstrumentEntities,
  selectInstrumentsLoaded,
  selectMarketDay,
  selectQuoteEntities,
  selectRouteInstrumentId,
} from '@app/market/feature/state/market.selectors';
import {
  selectOpenDepots,
  selectOrders,
  selectTradingLoaded,
} from '@app/trading/feature/state/trading.selectors';

import { PORTFOLIO_FEATURE_KEY, PortfolioState } from './portfolio.reducer';
import {
  heldSeries,
  missingCompositionIds,
  portfolioView,
  positionDetailView,
} from './portfolio.utils';

const selectState = createFeatureSelector<PortfolioState>(PORTFOLIO_FEATURE_KEY);

export const selectPortfolioDepotId = createSelector(selectState, (state) => state.depotId);
export const selectPositionSort = createSelector(selectState, (state) => state.sort);

/** Holdings and master data are there: the page can show positions or its empty state. */
export const selectPortfolioLoaded = createSelector(
  selectTradingLoaded,
  selectInstrumentsLoaded,
  (trading, instruments) => trading && instruments,
);

/** Series of all instruments held in the open depots, sorted (quote subscription of the page). */
export const selectPortfolioSeries = createSelector(
  selectOpenDepots,
  selectInstrumentEntities,
  heldSeries,
);

/** Held ETFs whose composition is missing for the current market day (look-through, E-28). */
export const selectMissingCompositions = createSelector(
  selectOpenDepots,
  selectInstrumentEntities,
  selectState,
  selectMarketDay,
  (depots, instruments, state, day) => ({
    day,
    ids: missingCompositionIds(depots, instruments, state, day),
  }),
);

/** The depot page: positions, sum row and allocation (US-PF-02, US-PF-03); follows the quotes. */
export const selectPortfolioView = createSelector(
  selectOpenDepots,
  selectAccounts,
  selectInstrumentEntities,
  selectQuoteEntities,
  selectState,
  portfolioView,
);

/**
 * The position detail of the instrument in the route (US-PF-06) in the depot chosen on the depot
 * page; follows the quotes. `null` while the instrument is unknown.
 */
export const selectPositionDetailView = createSelector(
  selectRouteInstrumentId,
  selectOpenDepots,
  selectOrders,
  selectInstrumentEntities,
  selectQuoteEntities,
  selectPortfolioDepotId,
  positionDetailView,
);
