import { Tick } from '@app/clock/domain/models/time.model';
import { Cents, MicroUnits } from '@app/shared/domain/models/money.model';

/**
 * A purchase that is still held (TS §7.6): its shares and its whole acquisition cost including the
 * purchase costs, in whole cents rather than as a price per share.
 */
export interface Lot {
  buyTick: Tick;
  quantity: MicroUnits;
  cost: Cents;
}

/** What a sale takes from the lots of a position (FIFO) and what stays. */
export interface LotSale {
  /** Acquisition cost of the shares sold. */
  cost: Cents;
  /** The lots after the sale, oldest first; empty when everything was sold. */
  lots: Lot[];
}
