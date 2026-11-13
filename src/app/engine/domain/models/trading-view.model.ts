import { DepotId } from '@app/banking/domain/models/account.model';
import { Lot } from '@app/portfolio/domain/models/lot.model';
import { Cents, MicroUnits } from '@app/shared/domain/models/money.model';
import { Order } from '@app/trading/domain/models/order.model';

/**
 * An order as the UI sees it in the `projection` event (TS §8.3): a copy of the engine's order.
 * Active orders have the status `open` or `triggered`, closed ones carry `closedAt`.
 */
export type OrderView = Order;

/**
 * Shares of an instrument in a depot (TS §7.6) as the UI sees them, with what the depot overview
 * and the position detail need (US-PF-02, US-PF-06). Its value comes from the quotes the UI
 * subscribes to (shares × bid, `holdingsValue`), the average cost from `averageCost(lots)`.
 */
export interface PositionView {
  instrumentId: string;
  quantity: MicroUnits;
  /** Shares not blocked by active sell orders: what a new sell order may sell (TS §7.5). */
  free: MicroUnits;
  /** Acquisition cost of the shares held: the sum of the lots' costs. */
  cost: Cents;
  /** Purchases still held, oldest first (FIFO). */
  lots: Lot[];
  /** Realized gains minus losses of the position's sales so far. */
  realizedGain: Cents;
  /** Gross dividends and distributions the position earned at its ex-dates. */
  distributions: Cents;
}

/** The positions of a depot in the order they were opened; empty without holdings. */
export interface DepotHoldingsView {
  depotId: DepotId;
  positions: PositionView[];
}

/**
 * Orders and holdings in the `projection` event (TS §8.3, §8.4). In a full projection `orders`
 * holds the active orders in placement order followed by the kept history (oldest first, at most
 * `ORDER_HISTORY_LENGTH`) and `depots` every depot of the player; otherwise only the orders placed,
 * changed or closed and the depots whose holdings or free shares changed since the last projection,
 * each in its whole current state.
 */
export interface TradingProjection {
  orders: OrderView[];
  depots: DepotHoldingsView[];
}
