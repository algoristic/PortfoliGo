import { DepotId } from '@app/banking/domain/models/account.model';
import { sellLots } from '@app/portfolio/domain/lot-logic';
import { Lot } from '@app/portfolio/domain/models/lot.model';
import { Cents, MicroUnits } from '@app/shared/domain/models/money.model';

import { Position, PositionSale } from './models/position.model';

/** Shares of an instrument in a depot; 0 without a position. */
export function holdingOf(
  positions: readonly Position[],
  depotId: DepotId,
  instrumentId: string,
): MicroUnits {
  return findPosition(positions, depotId, instrumentId)?.quantity ?? 0;
}

/** Whether a depot holds shares of any instrument. */
export function hasPositions(positions: readonly Position[], depotId: DepotId): boolean {
  return positions.some((position) => position.depotId === depotId && position.quantity > 0);
}

/** The position of an instrument in a depot, `undefined` without shares. */
export function findPosition<T extends Position>(
  positions: readonly T[],
  depotId: DepotId,
  instrumentId: string,
): T | undefined {
  return positions.find(
    (position) => position.depotId === depotId && position.instrumentId === instrumentId,
  );
}

/**
 * Books a purchase (TS §7.6): the lot joins the position of its instrument, a new position is added
 * at the end. Throws, and changes nothing, unless the lot holds a positive whole number of
 * millionths at a cost in whole cents.
 */
export function bookPurchase(
  positions: Position[],
  depotId: DepotId,
  instrumentId: string,
  lot: Lot,
): void {
  if (!Number.isSafeInteger(lot.quantity) || lot.quantity <= 0) {
    throw new RangeError(`bookPurchase: ${lot.quantity} is not a positive number of millionths`);
  }
  if (!Number.isSafeInteger(lot.cost)) {
    throw new RangeError(`bookPurchase: ${lot.cost} is not a whole number of cents`);
  }
  const position = findPosition(positions, depotId, instrumentId);
  if (position === undefined) {
    positions.push({
      depotId,
      instrumentId,
      quantity: lot.quantity,
      lots: [{ ...lot }],
      realizedGain: 0,
      distributions: 0,
    });
  } else {
    position.quantity += lot.quantity;
    position.lots.push({ ...lot });
  }
}

/**
 * Acquisition cost and realized gain of selling `quantity` shares for `proceeds` (the credit after
 * the sale's costs, TS §7.6), without booking: the lots are used up oldest first. Throws when the
 * depot holds fewer shares.
 */
export function saleOf(
  positions: readonly Position[],
  depotId: DepotId,
  instrumentId: string,
  quantity: MicroUnits,
  proceeds: Cents,
): PositionSale {
  const { cost } = sellLots(findPosition(positions, depotId, instrumentId)?.lots ?? [], quantity);
  return { costBasis: cost, realizedGain: proceeds - cost };
}

/**
 * Books a sale (TS §7.6): the lots give up `quantity` shares by FIFO, the realized gain adds to the
 * position, and a position without shares is removed. Returns what `saleOf` returns. Throws, and
 * changes nothing, when the depot holds fewer shares.
 */
export function bookSale(
  positions: Position[],
  depotId: DepotId,
  instrumentId: string,
  quantity: MicroUnits,
  proceeds: Cents,
): PositionSale {
  const position = findPosition(positions, depotId, instrumentId);
  const sale = sellLots(position?.lots ?? [], quantity);
  const result = { costBasis: sale.cost, realizedGain: proceeds - sale.cost };
  if (position === undefined) {
    return result;
  }
  if (sale.lots.length === 0) {
    positions.splice(positions.indexOf(position), 1);
  } else {
    position.lots = sale.lots;
    position.quantity -= quantity;
    position.realizedGain += result.realizedGain;
  }
  return result;
}

/** Adds a payout the position earned at an ex-date (TS §6.5); no position, no change. */
export function addDistribution(
  positions: Position[],
  depotId: DepotId,
  instrumentId: string,
  amount: Cents,
): void {
  const position = findPosition(positions, depotId, instrumentId);
  if (position !== undefined) {
    position.distributions += amount;
  }
}

/** Copy of a position that shares nothing mutable with it (snapshots, projections). */
export function copyPosition(position: Readonly<Position>): Position {
  return { ...position, lots: position.lots.map((lot) => ({ ...lot })) };
}
