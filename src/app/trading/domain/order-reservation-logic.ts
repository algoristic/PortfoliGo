import { orderCost } from '@app/banking/domain/bank-comparison-logic';
import { DepotId } from '@app/banking/domain/models/account.model';
import { DepotConditions } from '@app/banking/domain/models/bank-conditions.model';
import { Cents, MicroUnits } from '@app/shared/domain/models/money.model';
import { applyRate, marketValue } from '@app/shared/domain/money-logic';

import { ACTIVE_ORDER_STATUSES, Order, OrderSpec, OrderStatus } from './models/order.model';

/** Buffer on the estimated market value of market and stop purchases (TS §7.5). */
export const RESERVATION_BUFFER = 0.05;

/** The parts of an order the reservation sums need. */
export type ReservingOrder = Pick<
  Order,
  'depotId' | 'instrumentId' | 'side' | 'size' | 'status' | 'reserved'
>;

/**
 * Money a buy order reserves on the clearing account (TS §7.5): the estimated market value plus
 * the costs on it. Market orders estimate at the current ask, stop orders at the higher of ask
 * and stop (the order executes once the ask reaches the stop), both with a 5 % buffer on the
 * market value; limit and stop-limit orders at their limit. An order by amount reserves the amount.
 * Sell orders reserve nothing.
 */
export function orderReservation(
  spec: Pick<OrderSpec, 'side' | 'type' | 'size' | 'limit' | 'stop'>,
  ask: number,
  conditions: DepotConditions,
): Cents {
  if (spec.side === 'sell') {
    return 0;
  }
  if (spec.size.kind === 'amount') {
    return spec.size.amount;
  }
  const volume = estimatedVolume(spec, spec.size.quantity, ask);
  return volume + orderCost(conditions, volume);
}

/**
 * Market value of a buy order by quantity as the placement check estimates it (TS §7.5), without
 * the buffer of the reservation: market orders at the ask, stop orders at the higher of ask and
 * stop, limit and stop-limit orders at their limit; an order by amount counts its amount.
 */
export function estimatedOrderValue(
  spec: Pick<OrderSpec, 'type' | 'size' | 'limit' | 'stop'>,
  ask: number,
): Cents {
  if (spec.size.kind === 'amount') {
    return spec.size.amount;
  }
  return marketValue(spec.size.quantity, estimatedPrice(spec, ask));
}

/**
 * Sum of the reservations of the active orders of a depot, i.e. of its clearing account; only
 * purchases reserve (`orderReservation`), so sales add 0.
 */
export function reservedAmount(orders: readonly ReservingOrder[], depotId: DepotId): Cents {
  let sum = 0;
  for (const order of orders) {
    if (order.depotId === depotId && isActive(order.status)) {
      sum += order.reserved;
    }
  }
  return sum;
}

/** Shares of an instrument in the active sell orders of a depot. */
export function openSellQuantity(
  orders: readonly ReservingOrder[],
  depotId: DepotId,
  instrumentId: string,
): MicroUnits {
  let sum = 0;
  for (const order of orders) {
    if (
      order.depotId === depotId &&
      order.instrumentId === instrumentId &&
      order.side === 'sell' &&
      order.size.kind === 'quantity' &&
      isActive(order.status)
    ) {
      sum += order.size.quantity;
    }
  }
  return sum;
}

/** Shares a new sell order may sell: holding minus the shares in active sell orders (TS §7.5). */
export function freeQuantity(
  holding: MicroUnits,
  orders: readonly ReservingOrder[],
  depotId: DepotId,
  instrumentId: string,
): MicroUnits {
  return holding - openSellQuantity(orders, depotId, instrumentId);
}

export function isActive(status: OrderStatus): boolean {
  return (ACTIVE_ORDER_STATUSES as readonly OrderStatus[]).includes(status);
}

function estimatedVolume(
  spec: Pick<OrderSpec, 'type' | 'limit' | 'stop'>,
  quantity: MicroUnits,
  ask: number,
): Cents {
  const volume = marketValue(quantity, estimatedPrice(spec, ask));
  return spec.type === 'market' || spec.type === 'stop' ? buffered(volume) : volume;
}

function estimatedPrice(spec: Pick<OrderSpec, 'type' | 'limit' | 'stop'>, ask: number): number {
  switch (spec.type) {
    case 'market':
      return ask;
    case 'stop':
      return Math.max(ask, required(spec.stop, 'stop'));
    case 'limit':
    case 'stop-limit':
      return required(spec.limit, 'limit');
  }
}

function buffered(volume: Cents): Cents {
  return volume + applyRate(volume, RESERVATION_BUFFER);
}

function required(price: number | null, name: string): number {
  if (price === null) {
    throw new RangeError(`orderReservation: the order needs a ${name}`);
  }
  return price;
}
