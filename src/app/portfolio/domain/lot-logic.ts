import { Cents, MICRO_UNITS_PER_UNIT, MicroUnits } from '@app/shared/domain/models/money.model';
import { centsToEuros } from '@app/shared/domain/money-logic';

import { Lot, LotSale } from './models/lot.model';

/**
 * Acquisition cost of `sold` of a lot's `quantity` shares (TS §7.6): `round(cost × sold / quantity)`,
 * half away from zero. Computed exactly in integers, since the product of cents and millionths
 * leaves the range of exact doubles already for ordinary positions.
 */
export function lotCostShare(cost: Cents, sold: MicroUnits, quantity: MicroUnits): Cents {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new RangeError(`lotCostShare: ${quantity} is not a positive number of millionths`);
  }
  const product = BigInt(cost) * BigInt(sold);
  const divisor = BigInt(quantity);
  const magnitude = product < 0n ? -product : product;
  const rounded = (2n * magnitude + divisor) / (2n * divisor);
  return Number(product < 0n ? -rounded : rounded);
}

/**
 * Sells `quantity` shares from the lots, oldest first (FIFO, TS §7.6): whole lots leave with their
 * cost, the last one touched gives up `lotCostShare` of its cost and keeps the rest. So the costs of
 * any sequence of sales add up to exactly the costs of the lots. Throws when the lots hold fewer
 * shares (no short selling, TS §7.5).
 */
export function sellLots(lots: readonly Lot[], quantity: MicroUnits): LotSale {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new RangeError(`sellLots: ${quantity} is not a positive number of millionths`);
  }
  let open = quantity;
  let cost = 0;
  const remaining: Lot[] = [];
  for (const lot of lots) {
    if (open === 0) {
      remaining.push({ ...lot });
    } else if (open >= lot.quantity) {
      cost += lot.cost;
      open -= lot.quantity;
    } else {
      const share = lotCostShare(lot.cost, open, lot.quantity);
      cost += share;
      remaining.push({
        buyTick: lot.buyTick,
        quantity: lot.quantity - open,
        cost: lot.cost - share,
      });
      open = 0;
    }
  }
  if (open > 0) {
    throw new RangeError(`sellLots: the lots hold ${quantity - open} of ${quantity} shares`);
  }
  return { cost, lots: remaining };
}

/** Shares and acquisition cost of the lots. */
export function lotTotals(lots: readonly Lot[]): { quantity: MicroUnits; cost: Cents } {
  let quantity = 0;
  let cost = 0;
  for (const lot of lots) {
    quantity += lot.quantity;
    cost += lot.cost;
  }
  return { quantity, cost };
}

/**
 * Average cost per share in euros for display (TS §7.6): the acquisition costs divided by the
 * shares; `null` without shares.
 */
export function averageCost(lots: readonly Lot[]): number | null {
  const { quantity, cost } = lotTotals(lots);
  return quantity === 0 ? null : (centsToEuros(cost) * MICRO_UNITS_PER_UNIT) / quantity;
}
