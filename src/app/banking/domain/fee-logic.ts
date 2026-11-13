import { Cents } from '@app/shared/domain/models/money.model';
import { applyRate, roundHalfAwayFromZero } from '@app/shared/domain/money-logic';

import { CustodyFee, FeeModel } from './models/bank-conditions.model';

type PercentFee = Extract<FeeModel, { kind: 'percent' }>;
type FlatPlusPercentFee = Extract<FeeModel, { kind: 'flat-plus-percent' }>;
type TieredFee = Extract<FeeModel, { kind: 'tiered' }>;
type PercentPaCustodyFee = Extract<CustodyFee, { kind: 'percent-pa' }>;

/** Fee for a volume in cents (e.g. an order's market value), one function per model (TS §7.3). */
export function fee(model: FeeModel, volume: Cents): Cents {
  switch (model.kind) {
    case 'free':
      return 0;
    case 'flat':
      return model.amount;
    case 'percent':
      return percentFee(model, volume);
    case 'flat-plus-percent':
      return flatPlusPercentFee(model, volume);
    case 'tiered':
      return tieredFee(model, volume);
  }
}

/**
 * Custody fee for a period (TS §7.3): the yearly value (bounded by `min`/`max` for `percent-pa`)
 * times the period's share of the year (a quarter is ¼), rounded once.
 */
export function custodyFee(custody: CustodyFee, averageValue: Cents, yearShare: number): Cents {
  switch (custody.kind) {
    case 'none':
      return 0;
    case 'percent-pa':
      return roundHalfAwayFromZero(percentPaYearlyFee(custody, averageValue) * yearShare);
    case 'flat-pa':
      return roundHalfAwayFromZero(custody.amount * yearShare);
  }
}

function percentFee(model: PercentFee, volume: Cents): Cents {
  return bounded(applyRate(volume, model.rate), model.min, model.max);
}

function flatPlusPercentFee(model: FlatPlusPercentFee, volume: Cents): Cents {
  return bounded(model.amount + applyRate(volume, model.rate), model.min, model.max);
}

// The first tier whose bound reaches the volume prices the whole volume; above all bounds the last
// tier applies (TS §7.3).
function tieredFee(model: TieredFee, volume: Cents): Cents {
  const tier =
    model.tiers.find(({ upToVolume }) => volume <= (upToVolume ?? Infinity)) ?? model.tiers.at(-1);
  if (!tier) {
    throw new RangeError('fee: a tiered model needs at least one tier');
  }
  return fee(tier.fee, volume);
}

function percentPaYearlyFee(custody: PercentPaCustodyFee, averageValue: Cents): number {
  return bounded(averageValue * custody.rate, custody.min, custody.max);
}

// Bounded from below first, then from above: `max` wins when `min` exceeds it.
function bounded(value: number, min: Cents | undefined, max: Cents | undefined): number {
  const atLeast = min === undefined ? value : Math.max(value, min);
  return max === undefined ? atLeast : Math.min(atLeast, max);
}
