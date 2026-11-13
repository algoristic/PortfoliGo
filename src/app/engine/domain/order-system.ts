import { AccountId, Depot, DepotId } from '@app/banking/domain/models/account.model';
import { DepotConditions } from '@app/banking/domain/models/bank-conditions.model';
import { Transaction, TransactionDraft } from '@app/banking/domain/models/ledger.model';
import { isWeekend, minuteOfDay } from '@app/clock/domain/calendar-logic';
import { Tick, TradingHours } from '@app/clock/domain/models/time.model';
import { isTradingTime } from '@app/clock/domain/trading-hours-logic';
import { etfSeries, seriesIds } from '@app/market/domain/series';
import { Quote } from '@app/shared/domain/models/quote.model';
import {
  Order,
  ORDER_HISTORY_LENGTH,
  OrderRejection,
  OrderSpec,
  OrderStatus,
  OrderValidity,
} from '@app/trading/domain/models/order.model';
import {
  changedReservation,
  isAtPriceFloor,
  isOrderChange,
  isOrderSpec,
  orderChangeError,
  orderPlacementError,
} from '@app/trading/domain/order-command-logic';
import {
  executionError,
  executionTransaction,
  midRulesOutExecution,
  orderDecision,
  orderFill,
} from '@app/trading/domain/order-execution-logic';
import {
  freeQuantity,
  orderReservation,
  reservedAmount,
} from '@app/trading/domain/order-reservation-logic';
import { isOrderExpired, orderExpiry } from '@app/trading/domain/order-validity-logic';
import { bookUnits, holdingOf } from '@app/trading/domain/position-logic';

import { CommandResult } from './models/engine-command.model';
import { EngineEvent } from './models/engine-event.model';
import { PlayerState } from './models/game-state.model';
import { GameWorld } from './models/game-world.model';
import { PricePort } from './models/price-port.model';

/** Where the order system delivers its results; the engine wires them to its other systems. */
export interface OrderPorts {
  /** Books an execution through the banking system (monthly values, coverage events). */
  book(draft: TransactionDraft): Transaction;
  emit(event: EngineEvent): void;
  /** Schedules the expiry of an order at `tick` (task `order-expiry`). */
  scheduleExpiry(tick: Tick, orderId: string): void;
  /** A clearing account whose reservations changed (its available amount, TS §8.4). */
  changedAccount(id: AccountId): void;
  /** An order that was placed, changed or closed. */
  changedOrder(id: string): void;
  /** A depot whose positions changed. */
  changedDepot(id: DepotId): void;
}

/**
 * Orders of the player (TS §3.8, §7.5; US-HD-01–04): the commands `placeOrder`, `changeOrder` and
 * `cancelOrder`, the check of every active order in each tick at an open exchange, executions
 * with booking and unit posting, rejections and expiry. The rules are the pure functions of
 * `trading/domain`; this class looks up the state they need and applies their results.
 *
 * An order whose exchange is open when it is placed or changed is checked at once with the quote
 * of the current tick, so that a market order executes during the pause (TS §7.5).
 */
export class OrderSystem {
  readonly #player: PlayerState;
  readonly #prices: PricePort;
  readonly #ports: OrderPorts;
  readonly #conditions: ReadonlyMap<string, DepotConditions>;
  readonly #priceFloor: number;
  /** Instrument ID → series. */
  readonly #series: ReadonlyMap<string, number>;
  /** Trading hours per series; `null` for indices, which are not tradable. */
  readonly #hours: readonly (TradingHours | null)[];

  constructor(world: GameWorld, player: PlayerState, prices: PricePort, ports: OrderPorts) {
    this.#player = player;
    this.#prices = prices;
    this.#ports = ports;
    this.#conditions = new Map(world.world.banks.map((bank) => [bank.id, bank.conditions.depot]));
    this.#priceFloor = world.context.config.priceFloor;
    const ids = seriesIds(world.context);
    this.#series = new Map(ids.map((id, series) => [id, series]));
    const hours: (TradingHours | null)[] = ids.map(() => null);
    for (const exchange of world.exchanges) {
      const session: TradingHours = { open: exchange.open, close: exchange.close };
      for (const i of exchange.stocks) {
        hours[i] = session;
      }
      for (const e of exchange.etfs) {
        hours[etfSeries(world.context, e)] = session;
      }
    }
    this.#hours = hours;
  }

  /**
   * Whether `tick` has to be processed for the orders: some active order's exchange is open then
   * (TS §3.8). Closed exchanges open at a scheduled task, so the engine may skip all other ticks.
   */
  needsTick(tick: Tick): boolean {
    const orders = this.#player.orders;
    if (orders.length === 0 || isWeekend(tick)) {
      return false;
    }
    const minute = minuteOfDay(tick);
    for (const order of orders) {
      if (isInSession(this.#hoursOf(this.#seriesOf(order)), minute)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Step 2 of a tick (TS §3.8): checks the active orders at open exchanges in placement order.
   * The weekday and minute are computed once, since this runs every minute of a session.
   */
  trade(tick: Tick): void {
    const orders = this.#player.orders;
    if (orders.length === 0 || isWeekend(tick)) {
      return;
    }
    const minute = minuteOfDay(tick);
    for (let i = 0; i < orders.length;) {
      const order = orders[i];
      const series = this.#seriesOf(order);
      // A closed order leaves the list, so the next one moves to the same index.
      if (!(isInSession(this.#hoursOf(series), minute) && this.#check(order, series, tick))) {
        i++;
      }
    }
  }

  /** `placeOrder` (US-HD-01–03): checks, reserves, schedules the expiry and checks at once. */
  place(spec: unknown, tick: Tick): CommandResult {
    if (!isOrderSpec(spec)) {
      return { ok: false, error: 'invalid-command' };
    }
    const depot = this.#player.depots.find((candidate) => candidate.id === spec.depotId);
    if (depot === undefined) {
      return { ok: false, error: 'unknown-depot' };
    }
    if (depot.closedAt !== null) {
      return { ok: false, error: 'depot-closed' };
    }
    const series = this.#series.get(spec.instrumentId);
    if (series === undefined) {
      return { ok: false, error: 'unknown-instrument' };
    }
    const hours = this.#hours[series];
    const conditions = this.#depotConditions(depot);
    const quote = hours === null ? null : this.#quote(series, tick, conditions);
    const { orders, positions } = this.#player;
    const error = orderPlacementError(spec, {
      tick,
      conditions,
      quote,
      atPriceFloor: quote !== null && isAtPriceFloor(quote.mid, this.#priceFloor),
      clearingBalance: this.#balance(depot),
      reserved: reservedAmount(orders, depot.id),
      freeQuantity: freeQuantity(
        holdingOf(positions, depot.id, spec.instrumentId),
        orders,
        depot.id,
        spec.instrumentId,
      ),
    });
    if (error !== null || quote === null || hours === null) {
      return { ok: false, error: error ?? 'instrument-not-tradable' };
    }
    this.#player.orderSequence++;
    const order: Order = {
      ...copySpec(spec),
      id: `ord-${this.#player.orderSequence}`,
      status: 'open',
      placedAt: tick,
      expiresAt: orderExpiry(spec.validity, tick, hours),
      reserved: orderReservation(spec, quote.ask, conditions),
      triggeredAt: null,
      execution: null,
      closedAt: null,
      rejection: null,
    };
    orders.push(order);
    this.#ports.scheduleExpiry(order.expiresAt, order.id);
    this.#ports.changedOrder(order.id);
    this.#reservationChanged(order);
    if (isTradingTime(hours, tick)) {
      this.#check(order, series, tick);
    }
    return { ok: true, orderId: order.id };
  }

  /**
   * `changeOrder` (US-HD-04): new limit, stop or validity of an active order; the reservation
   * follows a new limit or stop, the expiry a new validity. Checked at once at an open exchange.
   */
  change(orderId: unknown, change: unknown, tick: Tick): CommandResult {
    if (typeof orderId !== 'string' || !isOrderChange(change)) {
      return { ok: false, error: 'invalid-command' };
    }
    const order = this.#player.orders.find((candidate) => candidate.id === orderId);
    if (order === undefined) {
      return { ok: false, error: this.#inactiveError(orderId) };
    }
    const depot = this.#depot(order.depotId);
    const conditions = this.#depotConditions(depot);
    const series = this.#seriesOf(order);
    const quote = this.#quote(series, tick, conditions);
    const error = orderChangeError(order, change, {
      tick,
      conditions,
      ask: quote.ask,
      clearingBalance: this.#balance(depot),
      reserved: reservedAmount(this.#player.orders, depot.id),
    });
    if (error !== null) {
      return { ok: false, error };
    }
    order.reserved = changedReservation(order, change, quote.ask, conditions);
    order.limit = change.limit ?? order.limit;
    order.stop = change.stop ?? order.stop;
    const hours = this.#hoursOf(series);
    if (change.validity !== undefined) {
      order.validity = copyValidity(change.validity);
      order.expiresAt = orderExpiry(order.validity, tick, hours);
      this.#ports.scheduleExpiry(order.expiresAt, order.id);
    }
    this.#ports.changedOrder(order.id);
    this.#reservationChanged(order);
    if (isTradingTime(hours, tick)) {
      this.#check(order, series, tick);
    }
    return { ok: true };
  }

  /** `cancelOrder` (US-HD-04): an active order ends and frees its reservation and shares. */
  cancel(orderId: unknown, tick: Tick): CommandResult {
    if (typeof orderId !== 'string') {
      return { ok: false, error: 'invalid-command' };
    }
    const order = this.#player.orders.find((candidate) => candidate.id === orderId);
    if (order === undefined) {
      return { ok: false, error: this.#inactiveError(orderId) };
    }
    this.#close(order, 'cancelled', tick);
    return { ok: true };
  }

  /** Task `order-expiry`: the order expires if it is still active and its validity ended. */
  expire(orderId: string, tick: Tick): void {
    const order = this.#player.orders.find((candidate) => candidate.id === orderId);
    if (order !== undefined && isOrderExpired(order, tick)) {
      this.#close(order, 'expired', tick);
      this.#ports.emit({ type: 'order-expired', ...orderEventBase(order, tick) });
    }
  }

  /**
   * Checks an active order with the quote of `tick` at its open exchange (TS §7.5): a reached stop
   * triggers it, a met condition executes it or rejects it. Returns whether the order closed. An
   * order waiting for its limit first looks at the mid only (`midRulesOutExecution`), which
   * spares deriving bid and ask in most minutes.
   */
  #check(order: Order, series: number, tick: Tick): boolean {
    if (midRulesOutExecution(order, this.#prices.priceAt(series, tick, tick))) {
      return false;
    }
    const depot = this.#depot(order.depotId);
    const conditions = this.#depotConditions(depot);
    const quote = this.#quote(series, tick, conditions);
    const decision = orderDecision(order, quote);
    if (decision.kind === 'none') {
      return false;
    }
    if (decision.kind === 'triggered' || decision.triggered) {
      order.status = 'triggered';
      order.triggeredAt = tick;
      this.#ports.changedOrder(order.id);
      this.#ports.emit({ type: 'order-triggered', ...orderEventBase(order, tick) });
    }
    if (decision.kind === 'triggered') {
      return false;
    }
    const fill = orderFill(order, decision.price, conditions);
    const rejection = executionError(order, fill, {
      atPriceFloor: isAtPriceFloor(quote.mid, this.#priceFloor),
      clearingBalance: this.#balance(depot),
      reserved: reservedAmount(this.#player.orders, depot.id),
      holding: holdingOf(this.#player.positions, depot.id, order.instrumentId),
    });
    if (rejection !== null) {
      this.#reject(order, rejection, tick);
      return true;
    }
    const transaction = this.#ports.book(
      executionTransaction(
        order,
        fill,
        { clearingAccountId: depot.clearingAccountId, bankId: depot.bankId },
        tick,
      ),
    );
    bookUnits(this.#player.positions, transaction.units ?? []);
    this.#ports.changedDepot(depot.id);
    order.execution = { ...fill, tick };
    this.#close(order, 'executed', tick);
    this.#ports.emit({
      type: 'order-executed',
      ...orderEventBase(order, tick),
      quantity: fill.quantity,
      price: fill.price,
      total: fill.total,
    });
    return true;
  }

  #reject(order: Order, rejection: OrderRejection, tick: Tick): void {
    order.rejection = rejection;
    this.#close(order, 'rejected', tick);
    this.#ports.emit({ type: 'order-rejected', ...orderEventBase(order, tick), reason: rejection });
  }

  /**
   * Ends an order: it leaves the active orders with its reservation and joins the history, of
   * which the newest `ORDER_HISTORY_LENGTH` stay.
   */
  #close(order: Order, status: Exclude<OrderStatus, 'open' | 'triggered'>, tick: Tick): void {
    const { orders, orderHistory } = this.#player;
    orders.splice(orders.indexOf(order), 1);
    const reserved = order.reserved;
    order.status = status;
    order.closedAt = tick;
    order.reserved = 0;
    orderHistory.push(order);
    if (orderHistory.length > ORDER_HISTORY_LENGTH) {
      orderHistory.splice(0, orderHistory.length - ORDER_HISTORY_LENGTH);
    }
    this.#ports.changedOrder(order.id);
    if (reserved !== 0) {
      this.#ports.changedAccount(this.#depot(order.depotId).clearingAccountId);
    }
  }

  #reservationChanged(order: Order): void {
    if (order.side === 'buy') {
      this.#ports.changedAccount(this.#depot(order.depotId).clearingAccountId);
    }
  }

  /** A closed order in the history cannot change any more; other IDs are unknown. */
  #inactiveError(orderId: string): 'order-not-active' | 'unknown-order' {
    return this.#player.orderHistory.some((order) => order.id === orderId)
      ? 'order-not-active'
      : 'unknown-order';
  }

  #quote(series: number, tick: Tick, conditions: DepotConditions): Quote {
    return this.#prices.quoteAt(series, tick, tick, conditions.spreadMarkup);
  }

  #balance(depot: Depot): number {
    return this.#player.balances.get(depot.clearingAccountId) ?? 0;
  }

  #seriesOf(order: Order): number {
    const series = this.#series.get(order.instrumentId);
    if (series === undefined) {
      throw new RangeError(`OrderSystem: unknown instrument ${order.instrumentId}`);
    }
    return series;
  }

  #hoursOf(series: number): TradingHours {
    const hours = this.#hours[series];
    if (hours === null) {
      throw new RangeError(`OrderSystem: series ${series} is not tradable`);
    }
    return hours;
  }

  #depot(id: DepotId): Depot {
    const depot = this.#player.depots.find((candidate) => candidate.id === id);
    if (depot === undefined) {
      throw new RangeError(`OrderSystem: unknown depot ${id}`);
    }
    return depot;
  }

  #depotConditions(depot: Depot): DepotConditions {
    const conditions = this.#conditions.get(depot.bankId);
    if (conditions === undefined) {
      throw new RangeError(`OrderSystem: unknown bank ${depot.bankId}`);
    }
    return conditions;
  }
}

/** Open from `open` (inclusive) to `close` (exclusive) on weekdays, as `isTradingTime`. */
function isInSession(hours: TradingHours, minute: number): boolean {
  return minute >= hours.open && minute < hours.close;
}

/** Copy of an order that shares nothing mutable with it (snapshots, TS §9.2). */
export function copyOrder(order: Readonly<Order>): Order {
  return {
    ...order,
    size: { ...order.size },
    validity: copyValidity(order.validity),
    execution: order.execution === null ? null : { ...order.execution },
  };
}

/** Only the fields of the spec, copied, so that the order shares nothing with the command. */
function copySpec(spec: OrderSpec): OrderSpec {
  const { depotId, instrumentId, side, type, size, limit, stop, validity } = spec;
  return {
    depotId,
    instrumentId,
    side,
    type,
    size: size.kind === 'quantity' ? { kind: size.kind, quantity: size.quantity } : { ...size },
    limit,
    stop,
    validity: copyValidity(validity),
  };
}

function copyValidity(validity: OrderValidity): OrderValidity {
  if (validity.kind !== 'date') {
    return { kind: validity.kind };
  }
  const { year, month, day } = validity.date;
  return { kind: 'date', date: { year, month, day } };
}

function orderEventBase(
  order: Order,
  tick: Tick,
): { tick: Tick; orderId: string; depotId: DepotId; instrumentId: string; side: Order['side'] } {
  return {
    tick,
    orderId: order.id,
    depotId: order.depotId,
    instrumentId: order.instrumentId,
    side: order.side,
  };
}
