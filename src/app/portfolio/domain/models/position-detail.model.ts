import { DepotId } from '@app/banking/domain/models/account.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { Cents, MicroUnits } from '@app/shared/domain/models/money.model';
import { OrderSide } from '@app/trading/domain/models/order.model';

import { Lot } from './lot.model';

/** The position of an instrument in one depot, as the trading projection carries it (TS §7.6). */
export interface DepotPosition {
  depotId: DepotId;
  instrumentId: string;
  quantity: MicroUnits;
  cost: Cents;
  lots: readonly Lot[];
  realizedGain: Cents;
  distributions: Cents;
}

/** A lot of the position detail with its depot and its acquisition cost per share in euros. */
export interface DetailLot extends Lot {
  depotId: DepotId;
  costPerShare: number | null;
}

/**
 * The position detail (US-PF-06): head figures as in the depot overview (TS §7.9), the realized
 * gain and the distributions of the position so far, and its lots oldest first.
 */
export interface PositionDetail {
  instrumentId: string;
  quantity: MicroUnits;
  cost: Cents;
  averageCost: number | null;
  /** Bid without mark-up; `null` until the quote is known (as value, gain and ratio). */
  price: number | null;
  value: Cents | null;
  gain: Cents | null;
  gainRatio: number | null;
  realizedGain: Cents;
  distributions: Cents;
  lots: DetailLot[];
}

/** Most trades the `positionTrades` query returns, the newest (TS §8.2). */
export const MAX_POSITION_TRADES = 200;

/**
 * An executed purchase or sale of the position detail (US-PF-06), read from the journal: an order
 * execution or a savings plan purchase (TS §7.5, §7.8).
 */
export interface PositionTrade {
  /** Running number of the transaction (unique per player). */
  seq: number;
  /** The order of an execution, `null` for a savings plan purchase. */
  orderId: string | null;
  /** The savings plan of a savings plan purchase, else `null`. */
  savingsPlanId: string | null;
  depotId: DepotId;
  side: OrderSide;
  tick: Tick;
  quantity: MicroUnits;
  /** Execution price in euros. */
  price: number;
  /** Order fee plus exchange fee (savings plan: its costs). */
  costs: Cents;
  /** Debit of a purchase or credit of a sale after costs. */
  total: Cents;
}

/** The newest trades of a position (at most the requested number) and how many there are. */
export interface PositionTrades {
  trades: PositionTrade[];
  total: number;
}
