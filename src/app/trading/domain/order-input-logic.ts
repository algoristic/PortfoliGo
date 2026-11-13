import { MICRO_UNITS_PER_UNIT, MicroUnits } from '@app/shared/domain/models/money.model';

/** Result of reading a number field of the order ticket: empty, not a valid number, or its value. */
export type OrderInputResult<T extends number> =
  { kind: 'empty' } | { kind: 'invalid' } | { kind: 'value'; value: T };

/** Decimal places of a quantity: millionths (TS §7.1). */
export const QUANTITY_DECIMALS = 6;
/** Decimal places of a limit or stop: the finest price grid (TS §6.7). */
export const PRICE_INPUT_DECIMALS = 4;
/** Up to nine integer digits, so that every quantity is exact in millionths (below 2⁵³). */
const MAX_INTEGER_DIGITS = 9;

// The integer part without separators or with a dot every three digits, then decimal places after
// a comma. `,5` and `10,` are accepted as `0,5` and `10`; no sign, quantities and prices are positive.
const DECIMAL_PATTERN = /^(\d*|\d{1,3}(?:\.\d{3})+)(?:,(\d*))?$/;
const SURROUNDING = /^\s+|\s+$/g;

/**
 * Reads a number of shares as the user types it (TS §11.8): `10`, `1.000`, `0,5`, `2,123456`.
 * Dots group thousands, a comma separates up to six decimal places; the value is in millionths.
 */
export function parseQuantityInput(text: string): OrderInputResult<MicroUnits> {
  const parts = decimalParts(text, QUANTITY_DECIMALS);
  if (parts.kind !== 'value') {
    return parts;
  }
  const { integer, fraction } = parts.value;
  return {
    kind: 'value',
    value:
      Number(integer || '0') * MICRO_UNITS_PER_UNIT +
      Number(fraction.padEnd(QUANTITY_DECIMALS, '0')),
  };
}

/** Reads a limit or stop in euros as the user types it: `99,9`, `1.234,50`, `0,0125`. */
export function parsePriceInput(text: string): OrderInputResult<number> {
  const parts = decimalParts(text, PRICE_INPUT_DECIMALS);
  if (parts.kind !== 'value') {
    return parts;
  }
  const { integer, fraction } = parts.value;
  return { kind: 'value', value: Number(`${integer || '0'}.${fraction || '0'}`) };
}

/** Units of the finest price grid per euro: 10⁴ for four decimal places. */
const PRICE_INPUT_SCALE = 10_000;
/** Least decimal places a price field shows, like the price grid above 1 € (TS §6.7). */
const MIN_PRICE_INPUT_DECIMALS = 2;

/**
 * A limit or stop as the price field shows it, the inverse of `parsePriceInput`: no grouping, a
 * comma, two to four decimal places (`99,50`, `1234,50`, `0,0125`). It fills the fields of a
 * change with the order's prices (US-HD-04).
 */
export function formatPriceInput(price: number): string {
  const units = Math.round(price * PRICE_INPUT_SCALE);
  const integer = String(Math.trunc(units / PRICE_INPUT_SCALE));
  const fraction = String(units % PRICE_INPUT_SCALE)
    .padStart(PRICE_INPUT_DECIMALS, '0')
    .replace(/0+$/, '')
    .padEnd(MIN_PRICE_INPUT_DECIMALS, '0');
  return `${integer},${fraction}`;
}

function decimalParts(
  text: string,
  maxDecimals: number,
): { kind: 'empty' } | { kind: 'invalid' } | { kind: 'value'; value: DecimalParts } {
  const trimmed = text.replace(SURROUNDING, '');
  if (trimmed === '') {
    return { kind: 'empty' };
  }
  const match = DECIMAL_PATTERN.exec(trimmed);
  if (match === null) {
    return { kind: 'invalid' };
  }
  const [, grouped, fraction = ''] = match;
  const integer = grouped.replace(/\./g, '');
  if (
    (integer === '' && fraction === '') ||
    integer.length > MAX_INTEGER_DIGITS ||
    fraction.length > maxDecimals
  ) {
    return { kind: 'invalid' };
  }
  return { kind: 'value', value: { integer, fraction } };
}

interface DecimalParts {
  integer: string;
  fraction: string;
}
