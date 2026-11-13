import { DepotId } from '@app/banking/domain/models/account.model';
import { lotTotals } from '@app/portfolio/domain/lot-logic';
import { Order } from '@app/trading/domain/models/order.model';
import { freeQuantity } from '@app/trading/domain/order-reservation-logic';

import { PlayerState } from './models/game-state.model';
import { DepotHoldingsView, OrderView, TradingProjection } from './models/trading-view.model';
import { copyOrder } from './order-system';

/** What changed since the last projection, from `drainChangedOrders` and `drainChangedDepots`. */
export interface TradingChanges {
  orders: Iterable<string>;
  depots: Iterable<DepotId>;
}

/**
 * Orders and holdings for the UI (TS §8.3, §8.4): everything, or only what `changed` names. A
 * changed order also sends its depot, since active sell orders block shares. Orders that left the
 * history in the meantime are left out; the UI keeps the newest `ORDER_HISTORY_LENGTH` itself.
 */
export function tradingProjection(
  player: Readonly<PlayerState>,
  changed?: TradingChanges,
): TradingProjection {
  if (changed === undefined) {
    return {
      orders: [...player.orders, ...player.orderHistory].map(orderView),
      depots: player.depots.map(({ id }) => depotHoldings(player, id)),
    };
  }
  const wanted = [...changed.orders];
  const byId = new Map<string, Order>();
  if (wanted.length > 0) {
    for (const order of player.orders) {
      byId.set(order.id, order);
    }
    for (const order of player.orderHistory) {
      byId.set(order.id, order);
    }
  }
  const orders: OrderView[] = [];
  const depots = new Set(changed.depots);
  for (const id of wanted) {
    const order = byId.get(id);
    if (order !== undefined) {
      orders.push(orderView(order));
      depots.add(order.depotId);
    }
  }
  return {
    orders,
    depots: player.depots
      .filter(({ id }) => depots.has(id))
      .map(({ id }) => depotHoldings(player, id)),
  };
}

function orderView(order: Readonly<Order>): OrderView {
  return copyOrder(order);
}

function depotHoldings(player: Readonly<PlayerState>, depotId: DepotId): DepotHoldingsView {
  return {
    depotId,
    positions: player.positions
      .filter((position) => position.depotId === depotId)
      .map(({ instrumentId, quantity, lots, realizedGain, distributions }) => ({
        instrumentId,
        quantity,
        free: freeQuantity(quantity, player.orders, depotId, instrumentId),
        cost: lotTotals(lots).cost,
        lots: lots.map((lot) => ({ ...lot })),
        realizedGain,
        distributions,
      })),
  };
}
