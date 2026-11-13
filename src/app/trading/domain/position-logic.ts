import { DepotId } from '@app/banking/domain/models/account.model';
import { UnitPosting } from '@app/banking/domain/models/ledger.model';
import { MicroUnits } from '@app/shared/domain/models/money.model';

import { Position } from './models/position.model';

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

/**
 * Books the unit postings of a transaction on the positions (TS §7.2, §7.6): a new position is
 * added at the end, one that reaches 0 shares is removed. Throws, and changes nothing, if a posting
 * is not a whole number of millionths or would leave a negative holding (no short selling, §7.5).
 */
export function bookUnits(positions: Position[], units: readonly UnitPosting[]): void {
  const next = positions.map((position) => ({ ...position }));
  for (const { depotId, instrumentId, quantity } of units) {
    if (!Number.isSafeInteger(quantity)) {
      throw new RangeError(`bookUnits: ${quantity} is not a whole number of millionths`);
    }
    const position = findPosition(next, depotId, instrumentId);
    const after = (position?.quantity ?? 0) + quantity;
    if (after < 0) {
      throw new RangeError(`bookUnits: ${depotId} holds less than ${-quantity} of ${instrumentId}`);
    }
    if (position === undefined) {
      next.push({ depotId, instrumentId, quantity: after });
    } else {
      position.quantity = after;
    }
  }
  positions.splice(0, positions.length, ...next.filter((position) => position.quantity > 0));
}

function findPosition<T extends Position>(
  positions: readonly T[],
  depotId: DepotId,
  instrumentId: string,
): T | undefined {
  return positions.find(
    (position) => position.depotId === depotId && position.instrumentId === instrumentId,
  );
}
