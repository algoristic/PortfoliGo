import { DepotId } from '@app/banking/domain/models/account.model';
import { CalendarDate, Tick } from '@app/clock/domain/models/time.model';
import { Cents, MicroUnits } from '@app/shared/domain/models/money.model';

export const ORDER_SIDES = ['buy', 'sell'] as const;
export type OrderSide = (typeof ORDER_SIDES)[number];

/** Market, limit, stop (stop loss, stop buy) and stop limit (TS §7.5, US-HD-03). */
export const ORDER_TYPES = ['market', 'limit', 'stop', 'stop-limit'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

/** Until the end of the trading day, until a date, good till cancelled (at most a year). */
export const ORDER_VALIDITY_KINDS = ['day', 'date', 'gtc'] as const;
export type OrderValidityKind = (typeof ORDER_VALIDITY_KINDS)[number];

export type OrderValidity =
  { kind: 'day' } | { kind: 'date'; date: CalendarDate } | { kind: 'gtc' };

/** States of the diagram in TS §7.5. */
export const ORDER_STATUSES = [
  'open',
  'triggered',
  'executed',
  'cancelled',
  'expired',
  'rejected',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Orders in these states are checked every tick, reserve money and block shares. */
export const ACTIVE_ORDER_STATUSES = [
  'open',
  'triggered',
] as const satisfies readonly OrderStatus[];
export type ActiveOrderStatus = (typeof ACTIVE_ORDER_STATUSES)[number];

/**
 * A number of shares or, for buy orders only, an amount of money whose shares are computed at
 * execution (TS §7.5, US-HD-01).
 */
export type OrderSize =
  { kind: 'quantity'; quantity: MicroUnits } | { kind: 'amount'; amount: Cents };

/** What the player asks for when placing an order. */
export interface OrderSpec {
  depotId: DepotId;
  instrumentId: string;
  side: OrderSide;
  type: OrderType;
  size: OrderSize;
  /** Limit price in euros for `limit` and `stop-limit`, otherwise `null`. */
  limit: number | null;
  /** Stop price in euros for `stop` and `stop-limit`, otherwise `null`. */
  stop: number | null;
  validity: OrderValidity;
}

/** What a player may change on an active order (US-HD-04); missing fields stay as they are. */
export interface OrderChange {
  limit?: number;
  stop?: number;
  validity?: OrderValidity;
}

/** Shares, price and costs of an execution; the basis of the booking (TS §7.2). */
export interface OrderFill {
  quantity: MicroUnits;
  /** Execution price in euros: the ask for buy orders, the bid for sell orders. */
  price: number;
  /** Quantity × price, rounded to cents (TS §7.1). */
  marketValue: Cents;
  orderFee: Cents;
  exchangeFee: Cents;
  /** Debit of a purchase (market value + costs) or credit of a sale (market value − costs). */
  total: Cents;
}

export interface OrderExecution extends OrderFill {
  tick: Tick;
}

/**
 * Closed orders the engine keeps for the order book (US-HD-04), newest last; older ones remain in
 * the journal (executions) and the notifications.
 */
export const ORDER_HISTORY_LENGTH = 500;

/**
 * Smallest market value of a purchase (TS §7.5, AP 7.3b), as for savings plans
 * (`SAVINGS_PLAN_MIN_AMOUNT`): below half a cent, a bank without fees would hand out shares for
 * nothing.
 */
export const MIN_ORDER_VALUE: Cents = 100;

export interface Order extends OrderSpec {
  id: string;
  status: OrderStatus;
  placedAt: Tick;
  /** First tick at which the order no longer applies (TS §7.5, `orderExpiry`). */
  expiresAt: Tick;
  /** Money reserved on the clearing account while the order is active; 0 for sell orders. */
  reserved: Cents;
  /** Tick at which the stop price was reached, `null` before or without a stop. */
  triggeredAt: Tick | null;
  execution: OrderExecution | null;
  /** Tick of the final state (executed, cancelled, expired, rejected), `null` while active. */
  closedAt: Tick | null;
  /** Why the order was rejected at execution, `null` otherwise. */
  rejection: OrderRejection | null;
}

/**
 * Why the engine refuses an order command or rejects an order at execution (TS §7.5, §8.2); the UI
 * maps the codes to texts (TS §8.6).
 */
export const ORDER_COMMAND_ERRORS = [
  /** No depot of the player has the ID (checked by the engine). */
  'unknown-depot',
  /** The depot is closed (checked by the engine). */
  'depot-closed',
  /** The world has no instrument with the ID (checked by the engine). */
  'unknown-instrument',
  /** Indices have no bid and ask and are not tradable (TS §6.7). */
  'instrument-not-tradable',
  /** The quantity is not a positive whole number of millionths. */
  'invalid-quantity',
  /** The amount is not a positive whole number of cents. */
  'invalid-amount',
  /** Orders by amount exist for purchases only. */
  'amount-only-for-buy',
  /** The bank offers only whole shares for single purchases (`fractionalShares`). */
  'fractional-not-allowed',
  /** Limit missing, not positive or given for an order type without a limit. */
  'invalid-limit',
  /** Stop missing, not positive or given for an order type without a stop. */
  'invalid-stop',
  /** The validity date is not a calendar date or has passed. */
  'invalid-validity',
  /** The validity ends more than a year after placing (or changing) the order. */
  'validity-too-long',
  /** A sale exceeds the free shares: holding minus shares in active sell orders. */
  'insufficient-quantity',
  /** Purchases of an instrument at the price floor are rejected (E-22, TS §6.4). */
  'price-floor',
  /** New purchases are blocked while the clearing account is negative (TS §7.4). */
  'clearing-account-negative',
  /** The reservation or the debit exceeds the available amount minus other reservations. */
  'insufficient-funds',
  /** At execution, the amount does not buy a single unit after costs. */
  'amount-too-small',
  /** A purchase's (estimated) market value is below `MIN_ORDER_VALUE` (TS §7.5). */
  'order-value-too-small',
  /** No order of the player has the ID (checked by the engine). */
  'unknown-order',
  /** Only open or triggered orders can be changed or cancelled. */
  'order-not-active',
  /** The stop of a triggered stop-limit order cannot change any more. */
  'stop-triggered',
] as const;
export type OrderCommandError = (typeof ORDER_COMMAND_ERRORS)[number];

/** Reasons that reject an active order at execution (TS §7.5: Open/Triggered → Rejected). */
export const ORDER_REJECTIONS = [
  'insufficient-funds',
  'price-floor',
  'amount-too-small',
  'order-value-too-small',
  'insufficient-quantity',
] as const satisfies readonly OrderCommandError[];
export type OrderRejection = (typeof ORDER_REJECTIONS)[number];

/**
 * What a tick's bid and ask mean for an active order (TS §7.5): nothing, the stop was reached and
 * the order now waits for its limit, or it executes at `price`. `triggered` tells whether the stop
 * was reached in this very tick.
 */
export type OrderDecision =
  { kind: 'none' } | { kind: 'triggered' } | { kind: 'execute'; price: number; triggered: boolean };
