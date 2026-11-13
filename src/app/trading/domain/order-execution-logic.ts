import { orderCost } from '@app/banking/domain/bank-comparison-logic';
import { fee } from '@app/banking/domain/fee-logic';
import { bankFeesAccount, MARKET_ACCOUNT } from '@app/banking/domain/ledger-logic';
import { AccountId } from '@app/banking/domain/models/account.model';
import { DepotConditions } from '@app/banking/domain/models/bank-conditions.model';
import { PostingDraft, TransactionDraft } from '@app/banking/domain/models/ledger.model';
import { availableAmount } from '@app/banking/domain/overdraft-logic';
import { Tick } from '@app/clock/domain/models/time.model';
import { Cents, MICRO_UNITS_PER_UNIT, MicroUnits } from '@app/shared/domain/models/money.model';
import { BidAsk } from '@app/shared/domain/models/quote.model';
import { eurosToCentsDown, marketValue } from '@app/shared/domain/money-logic';

import { Order, OrderDecision, OrderFill, OrderRejection } from './models/order.model';

/** What decides an active order's fate in a tick. */
export type DecidableOrder = Pick<Order, 'side' | 'type' | 'limit' | 'stop' | 'status'>;

/** What the execution of an order needs to know about it. */
export type ExecutableOrder = Pick<Order, 'side' | 'size'>;

/** State of the depot and its clearing account at execution. */
export interface ExecutionContext {
  /** The instrument's price is at the floor (`isAtPriceFloor`, E-22). */
  atPriceFloor: boolean;
  clearingBalance: Cents;
  /** Reservations of all active buy orders of the depot, including this order's (`reservedAmount`). */
  reserved: Cents;
  /** Shares of the instrument in the depot. */
  holding: MicroUnits;
}

/**
 * Decides an active order with the bid and ask of a tick at an open exchange (TS §7.5). Buy orders
 * look at the ask, sell orders at the bid:
 *
 * | type        | buy                       | sell                      |
 * | ----------- | ------------------------- | ------------------------- |
 * | market      | at the ask                | at the bid                |
 * | limit L     | if ask ≤ L: at the ask    | if bid ≥ L: at the bid    |
 * | stop S      | if ask ≥ S: as market     | if bid ≤ S: as market     |
 * | stop-limit  | if ask ≥ S: as limit L    | if bid ≤ S: as limit L    |
 *
 * A stop reached in a tick takes effect in the same tick. At the opening the first quote already
 * contains the overnight gap, so a stop loss can execute below its stop.
 */
export function orderDecision(order: DecidableOrder, quote: BidAsk): OrderDecision {
  const price = order.side === 'buy' ? quote.ask : quote.bid;
  const hasStop = order.type === 'stop' || order.type === 'stop-limit';
  const triggered = hasStop && order.status === 'open' && reaches(order.side, price, stopOf(order));
  if (hasStop && order.status === 'open' && !triggered) {
    return { kind: 'none' };
  }
  const limited = order.type === 'limit' || order.type === 'stop-limit';
  if (limited && !withinLimit(order.side, price, limitOf(order))) {
    return triggered ? { kind: 'triggered' } : { kind: 'none' };
  }
  return { kind: 'execute', price, triggered };
}

/**
 * Whether the mid price alone rules out an execution in this tick (TS §7.5), so that the engine
 * need not derive bid and ask: an order that only waits for its limit (a limit order, or a
 * triggered stop-limit order) cannot execute while the mid is beyond the limit, because the bid
 * never lies above the mid and the ask never below it. Market and untriggered stop orders always
 * need the quote.
 */
export function midRulesOutExecution(order: DecidableOrder, mid: number): boolean {
  const waitsForLimit =
    order.type === 'limit' || (order.type === 'stop-limit' && order.status === 'triggered');
  if (!waitsForLimit) {
    return false;
  }
  const limit = limitOf(order);
  return order.side === 'buy' ? mid > limit : mid < limit;
}

/**
 * Shares an order by amount buys at `price` (TS §7.5, US-HD-01): Stück = (Betrag − Kosten) / Brief,
 * rounded down to the bank's grid (whole shares, or millionths with `fractionalShares`). Since the
 * costs depend on the market value, the result is the largest quantity on the grid whose exact
 * market value (quantity × price, unrounded) plus the costs on its booked market value stays within
 * the amount; the booked debit (rounded market value plus costs) then never exceeds it. A binary
 * search over the number of grid steps keeps the invariant “`low` fits, `high` does not”, so one
 * step more never fits, even for tiered fees that are not monotonic. 0 if not even one step fits.
 */
export function amountOrderQuantity(
  amount: Cents,
  price: number,
  conditions: DepotConditions,
): MicroUnits {
  if (!(price > 0) || !Number.isFinite(price)) {
    throw new RangeError(`amountOrderQuantity: invalid price ${price}`);
  }
  const step = conditions.fractionalShares ? 1 : MICRO_UNITS_PER_UNIT;
  const fits = (steps: number): boolean => purchaseTotal(steps * step, price, conditions) <= amount;
  let low = 0;
  let high = 1;
  while (fits(high)) {
    low = high;
    high *= 2;
  }
  while (high - low > 1) {
    const middle = low + Math.floor((high - low) / 2);
    if (fits(middle)) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return low * step;
}

/**
 * Shares, market value and costs of executing an order at `price` (TS §7.1, §7.3): the market
 * value is rounded to cents once, the costs are the order fee on the market value plus the
 * exchange fee. Orders by amount compute their shares here (`amountOrderQuantity`).
 */
export function orderFill(
  order: ExecutableOrder,
  price: number,
  conditions: DepotConditions,
): OrderFill {
  const quantity =
    order.size.kind === 'quantity'
      ? order.size.quantity
      : amountOrderQuantity(order.size.amount, price, conditions);
  const value = marketValue(quantity, price);
  const orderFee = fee(conditions.orderFee, value);
  const costs = orderFee + conditions.exchangeFee;
  return {
    quantity,
    price,
    marketValue: value,
    orderFee,
    exchangeFee: conditions.exchangeFee,
    total: order.side === 'buy' ? value + costs : value - costs,
  };
}

/**
 * Why an order is rejected at execution, or `null` (TS §7.5): a purchase of an instrument at the
 * price floor (E-22), an order by amount that buys nothing, a debit above the available amount of
 * the clearing account minus the other orders' reservations (this order's own is released), or a
 * sale above the holding.
 */
export function executionError(
  order: Pick<Order, 'side' | 'reserved'>,
  fill: OrderFill,
  context: ExecutionContext,
): OrderRejection | null {
  if (order.side === 'sell') {
    return fill.quantity > context.holding ? 'insufficient-quantity' : null;
  }
  if (context.atPriceFloor) {
    return 'price-floor';
  }
  if (fill.quantity === 0) {
    return 'amount-too-small';
  }
  const otherReservations = context.reserved - order.reserved;
  const free =
    availableAmount({ balance: context.clearingBalance, limit: null }) - otherReservations;
  return fill.total > free ? 'insufficient-funds' : null;
}

/** Counter accounts of an execution: the clearing account and the bank of the depot. */
export interface ExecutionAccounts {
  clearingAccountId: AccountId;
  bankId: string;
}

/**
 * Booking of an execution (TS §7.2): `buy` or `sell` on the clearing account against the market
 * (market value) and the bank's fee account (order fee plus exchange fee, one posting, left out
 * at 0), with the shares as unit posting on the depot; `params` keep both fees apart.
 */
export function executionTransaction(
  order: Pick<Order, 'id' | 'depotId' | 'instrumentId' | 'side'>,
  fill: OrderFill,
  accounts: ExecutionAccounts,
  tick: Tick,
): TransactionDraft {
  const sign = order.side === 'buy' ? 1 : -1;
  const postings: PostingDraft[] = [
    { account: accounts.clearingAccountId, amount: -sign * fill.total },
    { account: MARKET_ACCOUNT, amount: sign * fill.marketValue },
  ];
  // The bank charges the exchange fee as third-party costs; both count as fees (TS §7.4, US-PF-07).
  const fees = fill.orderFee + fill.exchangeFee;
  if (fees !== 0) {
    postings.push({ account: bankFeesAccount(accounts.bankId), amount: fees });
  }
  return {
    tick,
    type: order.side,
    postings,
    units: [
      { depotId: order.depotId, instrumentId: order.instrumentId, quantity: sign * fill.quantity },
    ],
    refs: { orderId: order.id, instrumentId: order.instrumentId },
    params: {
      quantity: fill.quantity,
      price: fill.price,
      marketValue: fill.marketValue,
      orderFee: fill.orderFee,
      exchangeFee: fill.exchangeFee,
    },
  };
}

// Exact market value rounded up to whole cents, so that `≤ amount − costs` compares the exact value.
// The negation reuses the central rounding with its artefact correction (TS §7.1).
function purchaseTotal(quantity: MicroUnits, price: number, conditions: DepotConditions): Cents {
  const exactCeil = -eurosToCentsDown(-(quantity / MICRO_UNITS_PER_UNIT) * price);
  return exactCeil + orderCost(conditions, marketValue(quantity, price));
}

// A buy stop is reached when the ask rises to it, a sell stop when the bid falls to it.
function reaches(side: Order['side'], price: number, stop: number): boolean {
  return side === 'buy' ? price >= stop : price <= stop;
}

function withinLimit(side: Order['side'], price: number, limit: number): boolean {
  return side === 'buy' ? price <= limit : price >= limit;
}

function stopOf(order: DecidableOrder): number {
  if (order.stop === null) {
    throw new RangeError(`orderDecision: a ${order.type} order needs a stop`);
  }
  return order.stop;
}

function limitOf(order: DecidableOrder): number {
  if (order.limit === null) {
    throw new RangeError(`orderDecision: a ${order.type} order needs a limit`);
  }
  return order.limit;
}
