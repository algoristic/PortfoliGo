import { Action, createReducer, on } from '@ngrx/store';

import { DepotId } from '@app/banking/domain/models/account.model';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { HistoryRange, PerformanceFigures } from '@app/portfolio/domain/models/performance.model';
import { DEFAULT_POSITION_SORT, PositionSort } from '@app/portfolio/domain/models/portfolio.model';
import { nextPositionSort } from '@app/portfolio/domain/position-overview-logic';

import * as PortfolioActions from './portfolio.actions';
import { DEFAULT_HISTORY_RANGE, LoadedComposition, LoadedHistory } from './portfolio.model';

export const PORTFOLIO_FEATURE_KEY = 'portfolio';

/**
 * The depot page (TS §11.3): which depot is shown (`null` = all combined), the sorting of the
 * positions, and the index compositions of held ETFs for the look-through (E-28), each with the
 * market day it belongs to. Positions come from the `trading` slice, quotes from `market`.
 */
export interface PortfolioState {
  depotId: DepotId | null;
  sort: PositionSort;
  compositions: Record<string, LoadedComposition>;
  /** Requested compositions per ETF ID with the market day of the request. */
  loading: Record<string, number>;
  /** Failed compositions per ETF ID with the market day; asked again on the next market day. */
  failed: Record<string, number>;
  /** Live figures of the last projection (AP 5.7); `null` before the first. */
  performance: PerformanceFigures | null;
  /** Period of the net worth chart, kept for the game (US-PF-04). */
  historyRange: HistoryRange;
  /** The last series loaded, possibly of another period while the selected one loads. */
  history: LoadedHistory | null;
  historyLoading: boolean;
  historyFailed: boolean;
}

export const initialPortfolioState: PortfolioState = {
  depotId: null,
  sort: DEFAULT_POSITION_SORT,
  compositions: {},
  loading: {},
  failed: {},
  performance: null,
  historyRange: DEFAULT_HISTORY_RANGE,
  history: null,
  historyLoading: false,
  historyFailed: false,
};

function without(record: Record<string, number>, id: string, day: number): Record<string, number> {
  if (record[id] !== day) {
    return record;
  }
  const { [id]: _removed, ...rest } = record;
  return rest;
}

const reducer = createReducer(
  initialPortfolioState,
  on(SessionActions.enterGame, SessionActions.leaveGame, () => initialPortfolioState),
  on(PortfolioActions.selectedDepot, (state, { depotId }) => ({ ...state, depotId })),
  on(PortfolioActions.selectedPositionSort, (state, { key }) => ({
    ...state,
    sort: nextPositionSort(state.sort, key),
  })),
  on(PortfolioActions.requestedCompositions, (state, { day, ids }) => ({
    ...state,
    loading: { ...state.loading, ...Object.fromEntries(ids.map((id) => [id, day])) },
  })),
  on(PortfolioActions.retrievedComposition, (state, { day, instrumentId, composition }) => {
    const known = state.compositions[instrumentId];
    return {
      ...state,
      compositions:
        known !== undefined && known.day > day
          ? state.compositions
          : { ...state.compositions, [instrumentId]: { day, composition } },
      loading: without(state.loading, instrumentId, day),
    };
  }),
  on(PortfolioActions.loadCompositionFailure, (state, { day, instrumentId }) => ({
    ...state,
    failed: { ...state.failed, [instrumentId]: day },
    loading: without(state.loading, instrumentId, day),
  })),
  on(PortfolioActions.receivedPerformance, (state, { figures }) => ({
    ...state,
    performance: figures,
  })),
  on(PortfolioActions.selectedHistoryRange, (state, { range }) => ({
    ...state,
    historyRange: range,
    historyLoading: true,
    historyFailed: false,
  })),
  on(PortfolioActions.enterPerformanceHistory, (state) => ({
    ...state,
    historyLoading: true,
    historyFailed: false,
  })),
  on(PortfolioActions.retrievedPerformanceHistory, (state, { range, history }) =>
    range === state.historyRange
      ? {
          ...state,
          history: {
            range,
            points: history.points,
            resolution: history.resolution,
            tick: history.tick,
          },
          historyLoading: false,
        }
      : state,
  ),
  on(PortfolioActions.loadPerformanceHistoryFailure, (state, { range }) =>
    range === state.historyRange ? { ...state, historyLoading: false, historyFailed: true } : state,
  ),
);

export function portfolioReducer(
  state: PortfolioState | undefined,
  action: Action,
): PortfolioState {
  return reducer(state, action);
}
