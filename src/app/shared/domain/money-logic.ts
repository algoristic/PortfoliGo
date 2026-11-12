import { Cents, CENTS_PER_EURO, MICRO_UNITS_PER_UNIT, MicroUnits } from './models/money.model';

// From 10¹⁵ on, doubles have no decimal digits that could carry artefacts; reducing them to
// 15 digits would cut off integer digits instead.
const ARTEFACT_LIMIT = 1e15;

/**
 * Commercial rounding (half away from zero). The value is first reduced to 15 significant digits
 * so that binary artefacts such as `1.005 * 100 = 100.49999999999999` round as written.
 */
export function roundHalfAwayFromZero(value: number): number {
  const magnitude = Math.round(withoutArtefacts(Math.abs(value)));
  if (magnitude === 0) {
    return 0;
  }
  return value < 0 ? -magnitude : magnitude;
}

export function eurosToCents(euros: number): Cents {
  return roundHalfAwayFromZero(euros * CENTS_PER_EURO);
}

/** Euros to whole cents, rounded down (e.g. the payout of an ETF's distribution pot, TS §6.6). */
export function eurosToCentsDown(euros: number): Cents {
  const cents = Math.floor(withoutArtefacts(euros * CENTS_PER_EURO));
  return cents === 0 ? 0 : cents;
}

export function centsToEuros(cents: Cents): number {
  return cents / CENTS_PER_EURO;
}

export function unitsToMicroUnits(units: number): MicroUnits {
  return roundHalfAwayFromZero(units * MICRO_UNITS_PER_UNIT);
}

export function microUnitsToUnits(microUnits: MicroUnits): number {
  return microUnits / MICRO_UNITS_PER_UNIT;
}

/** Market value of a position: quantity × price in euros, rounded to cents. */
export function marketValue(quantity: MicroUnits, price: number): Cents {
  return roundHalfAwayFromZero((quantity * price * CENTS_PER_EURO) / MICRO_UNITS_PER_UNIT);
}

/** Applies a rate (fee, tax, interest; `0.025` = 2.5 %) to an amount, rounded to cents. */
export function applyRate(amount: Cents, rate: number): Cents {
  return roundHalfAwayFromZero(amount * rate);
}

function withoutArtefacts(value: number): number {
  return Math.abs(value) < ARTEFACT_LIMIT ? Number(value.toPrecision(15)) : value;
}
