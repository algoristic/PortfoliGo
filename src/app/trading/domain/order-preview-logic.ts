import { DepotConditions } from '@app/banking/domain/models/bank-conditions.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { Lot } from '@app/portfolio/domain/models/lot.model';
import { Cents, MicroUnits } from '@app/shared/domain/models/money.model';
import { BidAsk } from '@app/shared/domain/models/quote.model';
import { bidAsk } from '@app/shared/domain/price-step-logic';
import { SaleTaxPreview, TaxYear } from '@app/taxes/domain/models/tax.model';
import { saleTaxPreview } from '@app/taxes/domain/tax-logic';

import { OrderCommandError, OrderFill, OrderSpec } from './models/order.model';
import { freeFunds, orderPlacementError } from './order-command-logic';
import { orderFill } from './order-execution-logic';
import { orderReservation } from './order-reservation-logic';

/** A quote as the UI receives it (TS §8.4): last price, bid and ask without a venue mark-up. */
export interface ExchangeQuote {
  last: number;
  bid: number;
  ask: number;
}

/** What the order ticket knows when it previews an order (TS §11.8, AP 5.4). */
export interface OrderPreviewContext {
  tick: Tick;
  conditions: DepotConditions;
  /** Bid and ask with the depot bank's mark-up (`venueQuote`). */
  quote: BidAsk;
  /** The instrument's price is at the floor (`isAtPriceFloor`, E-22). */
  atPriceFloor: boolean;
  clearingBalance: Cents;
  /** Reservations of the active buy orders of the depot. */
  reserved: Cents;
  /** Shares a sale may sell (`PositionView.free`). */
  freeQuantity: MicroUnits;
  /** Lots of the position in the depot, oldest first; empty without one. */
  lots: readonly Lot[];
  /** The running tax year; `null` before the first projection. */
  taxYear: TaxYear | null;
}

/** Live preview of an order in the ticket (US-HD-01, US-HD-02, TS §11.8). */
export interface OrderPreview {
  /** Estimated execution price (`estimatedExecutionPrice`). */
  price: number;
  /** Shares, market value, costs and total at `price`, from the engine's `orderFill`. */
  fill: OrderFill;
  /** Money a purchase reserves (`orderReservation`); 0 for sales. */
  reservation: Cents;
  /** The reservation contains the 5 % buffer of market and stop purchases by quantity. */
  buffered: boolean;
  /** Free money of the clearing account: available amount minus reservations, at least 0. */
  available: Cents;
  /** What a purchase lacks: reservation minus free money, at least 0; 0 for sales. */
  shortfall: Cents;
  /** Gain or loss, tax and credit after taxes of a sale; `null` for purchases or without data. */
  tax: SaleTaxPreview | null;
  /** The engine's verdict on placing the order now (`orderPlacementError`), `null` if accepted. */
  error: OrderCommandError | null;
}

/**
 * Bid and ask at a bank with a venue mark-up (TS §6.7). The engine adds the mark-up to the relative
 * market spread before rounding to the price grid (`quoteAt`); the UI receives only the rounded bid
 * and ask without mark-up, so it takes their distance relative to the last price as the market
 * spread. That distance is never smaller than the unrounded spread (bid rounds down, ask up), so the
 * estimate is at most one grid step wider than the engine's quote. Without a mark-up the quote is
 * the engine's exactly.
 */
export function venueQuote(quote: ExchangeQuote, markup: number): BidAsk {
  if (markup === 0) {
    return { bid: quote.bid, ask: quote.ask };
  }
  return bidAsk(quote.last, (quote.ask - quote.bid) / quote.last + markup);
}

/**
 * Price at which the preview estimates the execution (TS §11.8): market orders at the current ask
 * (buy) or bid (sell); limit orders at the current price if it already meets the limit, else at the
 * limit; stop orders at the current price if the stop is already reached, else at the stop;
 * stop-limit orders at their limit.
 */
export function estimatedExecutionPrice(
  spec: Pick<OrderSpec, 'side' | 'type' | 'limit' | 'stop'>,
  quote: BidAsk,
): number {
  const buy = spec.side === 'buy';
  const current = buy ? quote.ask : quote.bid;
  switch (spec.type) {
    case 'market':
      return current;
    case 'limit':
      return buy ? Math.min(current, priceOf(spec.limit)) : Math.max(current, priceOf(spec.limit));
    case 'stop':
      return buy ? Math.max(current, priceOf(spec.stop)) : Math.min(current, priceOf(spec.stop));
    case 'stop-limit':
      return priceOf(spec.limit);
  }
}

/**
 * Preview of an order with the engine's functions (TS §7.3, §7.5, §7.7): costs and shares from
 * `orderFill` at the estimated price, the reservation from `orderReservation`, the check from
 * `orderPlacementError` and for sales the tax from `saleTaxPreview` on the credit after costs.
 */
export function orderPreview(spec: OrderSpec, context: OrderPreviewContext): OrderPreview {
  const price = estimatedExecutionPrice(spec, context.quote);
  const fill = orderFill(spec, price, context.conditions);
  const buy = spec.side === 'buy';
  const reservation = orderReservation(spec, context.quote.ask, context.conditions);
  const free = freeFunds(context.clearingBalance, context.reserved);
  return {
    price,
    fill,
    reservation,
    buffered:
      buy && spec.size.kind === 'quantity' && (spec.type === 'market' || spec.type === 'stop'),
    available: Math.max(0, free),
    shortfall: buy ? Math.max(0, reservation - Math.max(0, free)) : 0,
    tax: buy ? null : saleTax(spec, fill, context),
    error: orderPlacementError(spec, {
      tick: context.tick,
      conditions: context.conditions,
      quote: context.quote,
      atPriceFloor: context.atPriceFloor,
      clearingBalance: context.clearingBalance,
      reserved: context.reserved,
      freeQuantity: context.freeQuantity,
    }),
  };
}

function saleTax(
  spec: OrderSpec,
  fill: OrderFill,
  context: OrderPreviewContext,
): SaleTaxPreview | null {
  const held = context.lots.reduce((sum, lot) => sum + lot.quantity, 0);
  return context.taxYear === null ||
    spec.size.kind !== 'quantity' ||
    fill.quantity <= 0 ||
    fill.quantity > held
    ? null
    : saleTaxPreview(context.taxYear, context.lots, fill.quantity, fill.total);
}

function priceOf(price: number | null): number {
  if (price === null) {
    throw new RangeError('estimatedExecutionPrice: the order type needs this price');
  }
  return price;
}
