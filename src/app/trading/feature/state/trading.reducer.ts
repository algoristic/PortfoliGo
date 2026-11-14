import { createEntityAdapter, EntityAdapter, EntityState } from '@ngrx/entity';
import { Action, createReducer, on } from '@ngrx/store';

import { Tick } from '@app/clock/domain/models/time.model';
import { OrderView, PositionView } from '@app/engine/domain/models/trading-view.model';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { SavingsPlanView } from '@app/trading/domain/models/savings-plan.model';

import * as TradingActions from './trading.actions';
import { OrderCommand, PendingOrderCommands } from './trading.model';
import { droppedHistoryIds } from './trading.utils';

export const TRADING_FEATURE_KEY = 'trading';

/**
 * Orders and holdings of the loaded player from the trading part of the projection (TS §8.3,
 * §8.4, §11.3): the active orders and the kept history as entities, the positions per depot.
 */
export interface TradingState extends EntityState<OrderView> {
  /** Positions per depot ID in the order they were opened; a depot without holdings is empty. */
  holdings: Record<string, PositionView[]>;
  /** Tick of the last trading projection; `null` until the first full one. */
  tick: Tick | null;
  pending: PendingOrderCommands;
  /** All savings plans with their next execution; `null` until the first projection (AP 5.6b). */
  savingsPlans: SavingsPlanView[] | null;
  error?: unknown;
}

export const ordersAdapter: EntityAdapter<OrderView> = createEntityAdapter<OrderView>();

const noPendingCommands: PendingOrderCommands = { placeOrder: 0, changeOrder: 0, cancelOrder: 0 };

export const initialTradingState: TradingState = ordersAdapter.getInitialState({
  holdings: {},
  tick: null,
  pending: noPendingCommands,
  savingsPlans: null,
});

function changePending(state: TradingState, command: OrderCommand, delta: 1 | -1): TradingState {
  return {
    ...state,
    pending: { ...state.pending, [command]: Math.max(0, state.pending[command] + delta) },
  };
}

const reducer = createReducer(
  initialTradingState,
  on(SessionActions.enterGame, SessionActions.leaveGame, () => initialTradingState),
  // A full projection replaces everything, others replace the orders and depots they carry.
  on(TradingActions.receivedTrading, (state, { trading }) => {
    const holdings = trading.full ? {} : { ...state.holdings };
    for (const depot of trading.depots) {
      holdings[depot.depotId] = depot.positions;
    }
    const next = { ...state, holdings, tick: trading.tick };
    const updated = trading.full
      ? ordersAdapter.setAll(trading.orders, next)
      : ordersAdapter.upsertMany(trading.orders, next);
    const dropped = droppedHistoryIds(Object.values(updated.entities) as OrderView[]);
    return dropped.length === 0 ? updated : ordersAdapter.removeMany(dropped, updated);
  }),
  on(TradingActions.receivedSavingsPlans, (state, { savingsPlans }) => ({
    ...state,
    savingsPlans: savingsPlans.savingsPlans,
  })),
  on(
    TradingActions.createSavingsPlanFailure,
    TradingActions.changeSavingsPlanFailure,
    TradingActions.setSavingsPlanPausedFailure,
    TradingActions.deleteSavingsPlanFailure,
    (state, { error }) => ({ ...state, error }),
  ),
  on(TradingActions.submittedPlaceOrder, (state) => changePending(state, 'placeOrder', 1)),
  on(TradingActions.submittedChangeOrder, (state) => changePending(state, 'changeOrder', 1)),
  on(TradingActions.submittedCancelOrder, (state) => changePending(state, 'cancelOrder', 1)),
  on(TradingActions.placeOrderSuccess, (state) => changePending(state, 'placeOrder', -1)),
  on(TradingActions.changeOrderSuccess, (state) => changePending(state, 'changeOrder', -1)),
  on(TradingActions.cancelOrderSuccess, (state) => changePending(state, 'cancelOrder', -1)),
  on(TradingActions.placeOrderFailure, (state, { error }) => ({
    ...changePending(state, 'placeOrder', -1),
    error,
  })),
  on(TradingActions.changeOrderFailure, (state, { error }) => ({
    ...changePending(state, 'changeOrder', -1),
    error,
  })),
  on(TradingActions.cancelOrderFailure, (state, { error }) => ({
    ...changePending(state, 'cancelOrder', -1),
    error,
  })),
);

export function tradingReducer(state: TradingState | undefined, action: Action): TradingState {
  return reducer(state, action);
}
