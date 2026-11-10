/** Money as an integer number of euro cents (exact up to ±9 · 10¹⁵ cents). */
export type Cents = number;

/** Quantities as an integer number of millionths of a unit (fractional shares). */
export type MicroUnits = number;

export const CENTS_PER_EURO = 100;
export const MICRO_UNITS_PER_UNIT = 1_000_000;
