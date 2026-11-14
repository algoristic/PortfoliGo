import { Tick } from '@app/clock/domain/models/time.model';
import { Cents, MicroUnits } from '@app/shared/domain/models/money.model';
import { BadgeTone } from '@app/shared/ui/badge/badge.model';

/** What every row of the order book shows (US-HD-04). */
export interface OrderRow {
  id: string;
  instrumentId: string;
  instrumentName: string;
  depotLabel: string;
  sideLabel: string;
  sideTone: BadgeTone;
  statusLabel: string;
  statusTone: BadgeTone;
  typeLabel: string;
  limit: number | null;
  stop: number | null;
  /** The type label already names the stop or limit (type `stop` or `limit`): only the price follows. */
  priceNamed: boolean;
  /** Shares of an order by quantity, `null` for an order by amount. */
  quantity: MicroUnits | null;
  /** Amount of an order by amount, `null` for an order by quantity. */
  amount: Cents | null;
}

/** An active order with its validity, reservation and the names of its actions. */
export interface OpenOrderRow extends OrderRow {
  expiresAt: Tick;
  /** Reserved money of a purchase, `null` for a sale. */
  reserved: Cents | null;
  changeLabel: string;
  cancelLabel: string;
}

/** A closed order with its execution or the reason it closed. */
export interface ClosedOrderRow extends OrderRow {
  closedAt: Tick | null;
  execution: {
    tick: Tick;
    quantity: MicroUnits;
    price: number;
    /** Order fee plus exchange fee. */
    costs: Cents;
    total: Cents;
  } | null;
  /** Why the engine rejected the order, `null` otherwise. */
  rejectionLabel: string | null;
}
