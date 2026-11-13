import { DepotId } from '@app/banking/domain/models/account.model';
import { Lot } from '@app/portfolio/domain/models/lot.model';
import { Cents, MicroUnits } from '@app/shared/domain/models/money.model';

/**
 * Shares of an instrument in a depot (TS §7.6), kept by the engine from the executions: the lots
 * of the purchases still held, oldest first, whose quantities sum to `quantity`. The figures count
 * from the purchase that opened the position; a position sold completely leaves the player state,
 * its history stays in the journal (`refs.instrumentId`, sale parameters `costBasis` and
 * `realizedGain`).
 */
export interface Position {
  depotId: DepotId;
  instrumentId: string;
  quantity: MicroUnits;
  lots: Lot[];
  /** Realized gains minus losses of the sales so far (proceeds after costs − acquisition cost). */
  realizedGain: Cents;
  /** Gross dividends and fund distributions the holding earned at its ex-dates. */
  distributions: Cents;
}

/** Acquisition cost and realized gain of a sale, also parameters of its booking (TS §7.6). */
export interface PositionSale {
  costBasis: Cents;
  realizedGain: Cents;
}
