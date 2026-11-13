import { TradingProjectionUpdate } from '@app/engine/data-access/service/engine-service.model';
import { OrderView, PositionView } from '@app/engine/domain/models/trading-view.model';
import { ORDER_HISTORY_LENGTH, OrderStatus } from '@app/trading/domain/models/order.model';

import * as TradingActions from './trading.actions';
import { initialTradingState, tradingReducer, TradingState } from './trading.reducer';

function order(n: number, status: OrderStatus, closedAt: number | null = null): OrderView {
  return {
    id: `ord-${n}`,
    depotId: 'dep-2',
    instrumentId: 'stk-0001',
    side: 'buy',
    type: 'limit',
    size: { kind: 'quantity', quantity: 1_000_000 },
    limit: 10,
    stop: null,
    validity: { kind: 'gtc' },
    status,
    placedAt: n,
    expiresAt: 1_000_000,
    reserved: 0,
    triggeredAt: null,
    execution: null,
    closedAt,
    rejection: null,
  };
}

function position(instrumentId: string, quantity: number): PositionView {
  return {
    instrumentId,
    quantity,
    free: quantity,
    cost: 0,
    lots: [],
    realizedGain: 0,
    distributions: 0,
  };
}

function update(
  full: boolean,
  orders: OrderView[],
  depots: TradingProjectionUpdate['depots'] = [],
): TradingProjectionUpdate {
  return { tick: 7, full, orders, depots };
}

function receive(state: TradingState, trading: TradingProjectionUpdate): TradingState {
  return tradingReducer(state, TradingActions.receivedTrading({ trading }));
}

describe('tradingReducer', () => {
  describe('receivedTrading', () => {
    it('replaces everything with a full projection and only the carried parts otherwise', () => {
      const full = receive(
        initialTradingState,
        update(
          true,
          [order(1, 'open'), order(2, 'executed', 5)],
          [
            { depotId: 'dep-2', positions: [position('stk-0001', 3_000_000)] },
            { depotId: 'dep-4', positions: [position('stk-0002', 1_000_000)] },
          ],
        ),
      );
      expect(full.ids).toEqual(['ord-1', 'ord-2']);
      expect(full.tick).toBe(7);

      // ord-1 closes, ord-3 is new, dep-4 was sold out; dep-2 keeps its positions.
      const changed = receive(
        full,
        update(
          false,
          [order(1, 'cancelled', 8), order(3, 'open')],
          [{ depotId: 'dep-4', positions: [] }],
        ),
      );
      expect(changed.entities['ord-1']?.status).toBe('cancelled');
      expect(changed.ids).toEqual(['ord-1', 'ord-2', 'ord-3']);
      expect(changed.holdings).toEqual({
        'dep-2': [position('stk-0001', 3_000_000)],
        'dep-4': [],
      });

      const reloaded = receive(changed, update(true, [order(3, 'open')]));
      expect(reloaded.ids).toEqual(['ord-3']);
      expect(reloaded.holdings).toEqual({});
    });

    it('keeps the newest ORDER_HISTORY_LENGTH closed orders like the engine (TS §8.4)', () => {
      const history = Array.from({ length: ORDER_HISTORY_LENGTH }, (_, i) =>
        order(i + 1, 'executed', 100 + i),
      );
      const full = receive(initialTradingState, update(true, [...history, order(900, 'open')]));
      expect(full.ids.length).toBe(ORDER_HISTORY_LENGTH + 1);

      // Two more close: the two oldest closed orders leave, the active one stays.
      const next = receive(
        full,
        update(false, [order(901, 'expired', 5_000), order(902, 'rejected', 5_001)]),
      );
      expect(next.ids.length).toBe(ORDER_HISTORY_LENGTH + 1 + 2 - 2);
      expect(next.entities['ord-1']).toBeUndefined();
      expect(next.entities['ord-2']).toBeUndefined();
      expect(next.entities['ord-3']).toBeDefined();
      expect(next.entities['ord-900']?.status).toBe('open');
      expect(next.entities['ord-902']).toBeDefined();
    });
  });

  it('counts running order commands per kind until their reply', () => {
    const spec = order(1, 'open');
    let state = tradingReducer(
      initialTradingState,
      TradingActions.submittedPlaceOrder({ order: spec }),
    );
    state = tradingReducer(state, TradingActions.submittedCancelOrder({ orderId: 'ord-1' }));
    expect(state.pending).toEqual({ placeOrder: 1, changeOrder: 0, cancelOrder: 1 });
    state = tradingReducer(
      state,
      TradingActions.placeOrderFailure({ order: spec, error: new Error('x') }),
    );
    state = tradingReducer(state, TradingActions.cancelOrderSuccess({ orderId: 'ord-1', tick: 3 }));
    expect(state.pending).toEqual({ placeOrder: 0, changeOrder: 0, cancelOrder: 0 });
  });
});
