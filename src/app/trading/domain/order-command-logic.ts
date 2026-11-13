import { DepotConditions } from '@app/banking/domain/models/bank-conditions.model';
import { availableAmount } from '@app/banking/domain/overdraft-logic';
import { Tick } from '@app/clock/domain/models/time.model';
import { Cents, MICRO_UNITS_PER_UNIT, MicroUnits } from '@app/shared/domain/models/money.model';
import { BidAsk } from '@app/shared/domain/models/quote.model';

import {
  Order,
  ORDER_SIDES,
  ORDER_TYPES,
  OrderChange,
  OrderCommandError,
  OrderSide,
  OrderSpec,
  OrderType,
  OrderValidity,
} from './models/order.model';
import { orderReservation } from './order-reservation-logic';
import { validityError } from './order-validity-logic';

/** State the engine looks up before checking a new order. */
export interface OrderPlacementContext {
  tick: Tick;
  conditions: DepotConditions;
  /** Current bid and ask with the bank's venue markup; `null` for indices (not tradable). */
  quote: BidAsk | null;
  /** The instrument's price is at the floor (`isAtPriceFloor`, E-22). */
  atPriceFloor: boolean;
  clearingBalance: Cents;
  /** Reservations of the active buy orders of the depot (`reservedAmount`). */
  reserved: Cents;
  /** Shares a sale may sell (`freeQuantity`). */
  freeQuantity: MicroUnits;
}

/** State the engine looks up before changing an order. */
export interface OrderChangeContext {
  tick: Tick;
  conditions: DepotConditions;
  /** Current ask with the bank's venue markup, for the new reservation of market and stop orders. */
  ask: number;
  clearingBalance: Cents;
  /** Reservations of the active buy orders of the depot, including this order's. */
  reserved: Cents;
}

/** E-22: an instrument whose price has reached the floor of the market model (TS §6.4). */
export function isAtPriceFloor(price: number, floor: number): boolean {
  return price <= floor;
}

/** Free money of a clearing account for orders: available amount minus reservations (TS §7.5). */
export function freeFunds(clearingBalance: Cents, reserved: Cents): Cents {
  return availableAmount({ balance: clearingBalance, limit: null }) - reserved;
}

/**
 * Checks a new order (TS §7.5, US-HD-01–03) in this order: tradable instrument, size, limit and
 * stop, validity; a sale against the free shares; a purchase against the price floor (E-22), a
 * negative clearing account and its reservation against the free money (`freeFunds`). `null` if
 * the order is accepted; the engine then stores `orderExpiry` and `orderReservation`.
 */
export function orderPlacementError(
  spec: OrderSpec,
  context: OrderPlacementContext,
): OrderCommandError | null {
  if (context.quote === null) {
    return 'instrument-not-tradable';
  }
  const error =
    sizeError(spec, context.conditions) ??
    priceError(spec.type, spec.limit, spec.stop) ??
    validityError(spec.validity, context.tick);
  if (error !== null) {
    return error;
  }
  if (spec.side === 'sell') {
    return quantityOf(spec) > context.freeQuantity ? 'insufficient-quantity' : null;
  }
  if (context.atPriceFloor) {
    return 'price-floor';
  }
  if (context.clearingBalance < 0) {
    return 'clearing-account-negative';
  }
  const reservation = orderReservation(spec, context.quote.ask, context.conditions);
  return reservation > freeFunds(context.clearingBalance, context.reserved)
    ? 'insufficient-funds'
    : null;
}

/**
 * Checks a change of limit, stop or validity (US-HD-04): only active orders, only prices the order
 * type has, no stop change after the trigger; the validity counts from the change. A purchase must
 * cover the growth of its reservation (`changedReservation`) with the free money.
 */
export function orderChangeError(
  order: Order,
  change: OrderChange,
  context: OrderChangeContext,
): OrderCommandError | null {
  if (order.status !== 'open' && order.status !== 'triggered') {
    return 'order-not-active';
  }
  if (change.stop !== undefined && order.status === 'triggered') {
    return 'stop-triggered';
  }
  const changed = changedSpec(order, change);
  const error =
    priceError(order.type, changed.limit, changed.stop) ??
    (change.validity ? validityError(change.validity, context.tick) : null);
  if (error !== null) {
    return error;
  }
  const growth =
    changedReservation(order, change, context.ask, context.conditions) - order.reserved;
  return growth > freeFunds(context.clearingBalance, context.reserved)
    ? 'insufficient-funds'
    : null;
}

/**
 * Reservation after a change: recomputed when limit or stop change, otherwise kept (a new validity
 * does not re-estimate a market order).
 */
export function changedReservation(
  order: Order,
  change: OrderChange,
  ask: number,
  conditions: DepotConditions,
): Cents {
  if (change.limit === undefined && change.stop === undefined) {
    return order.reserved;
  }
  return orderReservation(changedSpec(order, change), ask, conditions);
}

/**
 * Whether a command payload has the shape of an `OrderSpec` (TS §8.5): the engine answers
 * `invalid-command` otherwise. Values are left to `orderPlacementError`, so any number passes here.
 */
export function isOrderSpec(value: unknown): value is OrderSpec {
  if (!isRecord(value)) {
    return false;
  }
  const { depotId, instrumentId, side, type, size, limit, stop, validity } = value;
  return (
    typeof depotId === 'string' &&
    typeof instrumentId === 'string' &&
    ORDER_SIDES.includes(side as OrderSide) &&
    ORDER_TYPES.includes(type as OrderType) &&
    isOrderSize(size) &&
    isPriceOrNull(limit) &&
    isPriceOrNull(stop) &&
    isOrderValidity(validity)
  );
}

/** Whether a command payload has the shape of an `OrderChange`; missing fields stay as they are. */
export function isOrderChange(value: unknown): value is OrderChange {
  if (!isRecord(value)) {
    return false;
  }
  const { limit, stop, validity } = value;
  return (
    (limit === undefined || typeof limit === 'number') &&
    (stop === undefined || typeof stop === 'number') &&
    (validity === undefined || isOrderValidity(validity))
  );
}

function isOrderSize(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return value['kind'] === 'quantity'
    ? typeof value['quantity'] === 'number'
    : value['kind'] === 'amount' && typeof value['amount'] === 'number';
}

function isOrderValidity(value: unknown): value is OrderValidity {
  if (!isRecord(value)) {
    return false;
  }
  if (value['kind'] !== 'date') {
    return value['kind'] === 'day' || value['kind'] === 'gtc';
  }
  const date = value['date'];
  return (
    isRecord(date) &&
    typeof date['year'] === 'number' &&
    typeof date['month'] === 'number' &&
    typeof date['day'] === 'number'
  );
}

function isPriceOrNull(value: unknown): boolean {
  return value === null || typeof value === 'number';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function changedSpec(order: Order, change: OrderChange): Order {
  return { ...order, limit: change.limit ?? order.limit, stop: change.stop ?? order.stop };
}

function sizeError(spec: OrderSpec, conditions: DepotConditions): OrderCommandError | null {
  if (spec.size.kind === 'amount') {
    if (spec.side === 'sell') {
      return 'amount-only-for-buy';
    }
    return isPositiveInteger(spec.size.amount) ? null : 'invalid-amount';
  }
  if (!isPositiveInteger(spec.size.quantity)) {
    return 'invalid-quantity';
  }
  // Sales may always contain fractions; only single purchases depend on the bank (TS §7.5).
  const whole = spec.size.quantity % MICRO_UNITS_PER_UNIT === 0;
  return spec.side === 'buy' && !conditions.fractionalShares && !whole
    ? 'fractional-not-allowed'
    : null;
}

function priceError(
  type: OrderType,
  limit: number | null,
  stop: number | null,
): OrderCommandError | null {
  if (!isValidPrice(limit, type === 'limit' || type === 'stop-limit')) {
    return 'invalid-limit';
  }
  return isValidPrice(stop, type === 'stop' || type === 'stop-limit') ? null : 'invalid-stop';
}

function isValidPrice(price: number | null, required: boolean): boolean {
  return required ? price !== null && Number.isFinite(price) && price > 0 : price === null;
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function quantityOf(spec: OrderSpec): MicroUnits {
  return spec.size.kind === 'quantity' ? spec.size.quantity : 0;
}
