import { Cents, CENTS_PER_EURO, MICRO_UNITS_PER_UNIT, MicroUnits } from './models/money.model';

/**
 * Commercial rounding (half away from zero). The value is first reduced to 15 significant digits
 * so that binary artefacts such as `1.005 * 100 = 100.49999999999999` round as written.
 */
export function roundHalfAwayFromZero(value: number): number {
  const magnitude = Math.round(Number(Math.abs(value).toPrecision(15)));
  if (magnitude === 0) {
    return 0;
  }
  return value < 0 ? -magnitude : magnitude;
}

export function eurosToCents(euros: number): Cents {
  return roundHalfAwayFromZero(euros * CENTS_PER_EURO);
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
