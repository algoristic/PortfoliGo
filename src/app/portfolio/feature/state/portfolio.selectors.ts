import { createFeatureSelector, createSelector } from '@ngrx/store';

import { selectAccounts } from '@app/banking/feature/state/banking.selectors';
import { dayIndex } from '@app/clock/domain/calendar-logic';
import {
  selectInstrumentEntities,
  selectInstrumentsLoaded,
  selectMarketDay,
  selectQuoteEntities,
  selectRouteInstrumentId,
} from '@app/market/feature/state/market.selectors';
import {
  selectOpenDepots,
  selectTradingLoaded,
} from '@app/trading/feature/state/trading.selectors';

import { PerformanceHistoryView } from './portfolio.model';
import { PORTFOLIO_FEATURE_KEY, PortfolioState } from './portfolio.reducer';
import {
  heldSeries,
  missingCompositionIds,
  portfolioView,
  positionDetailView,
  positionTradesLoad,
} from './portfolio.utils';

const selectState = createFeatureSelector<PortfolioState>(PORTFOLIO_FEATURE_KEY);

export const selectPortfolioDepotId = createSelector(selectState, (state) => state.depotId);
export const selectPositionSort = createSelector(selectState, (state) => state.sort);
export const selectPositionTrades = createSelector(selectState, (state) => state.trades);

/** Live performance figures (AP 5.7, US-PF-01, US-PF-05); `null` before the first projection. */
export const selectPerformanceFigures = createSelector(selectState, (state) => state.performance);
export const selectHistoryRange = createSelector(selectState, (state) => state.historyRange);

/** Calendar day of the last figures; a new one means a day ended (`null` before the first). */
export const selectPerformanceDay = createSelector(selectPerformanceFigures, (figures) =>
  figures === null ? null : dayIndex(figures.tick),
);

/**
 * The net worth chart (US-PF-04): the selected period and the series loaded for it; a series of
 * another period stays out, so the chart never shows the wrong period while the new one loads.
 */
export const selectPerformanceHistory = createSelector(
  selectState,
  (state): PerformanceHistoryView => ({
    range: state.historyRange,
    history: state.history?.range === state.historyRange ? state.history : null,
    loading: state.historyLoading,
    failed: state.historyFailed,
  }),
);

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
  selectPositionTrades,
  selectInstrumentEntities,
  selectQuoteEntities,
  selectPortfolioDepotId,
  positionDetailView,
);

/** What the position detail loads from the journal (US-PF-06); `null` without an instrument. */
export const selectPositionTradesLoad = createSelector(
  selectRouteInstrumentId,
  selectOpenDepots,
  selectPortfolioDepotId,
  positionTradesLoad,
);
