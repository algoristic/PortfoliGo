import { MICRO_UNITS_PER_UNIT, MicroUnits } from '@app/shared/domain/models/money.model';
import { numberSeparators, NumberSeparators } from '@app/shared/util/locale';

/** Result of reading a number field of the order ticket: empty, not a valid number, or its value. */
export type OrderInputResult<T extends number> =
  { kind: 'empty' } | { kind: 'invalid' } | { kind: 'value'; value: T };

/** Decimal places of a quantity: millionths (TS §7.1). */
export const QUANTITY_DECIMALS = 6;
/** Decimal places of a limit or stop: the finest price grid (TS §6.7). */
export const PRICE_INPUT_DECIMALS = 4;
/** Up to nine integer digits, so that every quantity is exact in millionths (below 2⁵³). */
const MAX_INTEGER_DIGITS = 9;

// The integer part without separators or with a group separator every three digits, then decimal
// places after the decimal separator (TS §11.9: `.` and `,` in German, `,` and `.` in English). In
// German `,5` and `10,` are accepted as `0,5` and `10`; no sign, quantities and prices are positive.
const DECIMAL_PATTERNS = new Map<string, RegExp>();
const SURROUNDING = /^\s+|\s+$/g;

/**
 * Reads a number of shares as the user types it (TS §11.8): `10`, `1.000`, `0,5`, `2,123456`.
 * In German dots group thousands and a comma separates up to six decimal places (English
 * `1,000.5`); the value is in millionths. The separators default to those of the language.
 */
export function parseQuantityInput(
  text: string,
  separators: NumberSeparators = numberSeparators(),
): OrderInputResult<MicroUnits> {
  const parts = decimalParts(text, QUANTITY_DECIMALS, separators);
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

/**
 * Reads a limit or stop in euros as the user types it: `99,9`, `1.234,50`, `0,0125` (English
 * `99.9`, `1,234.50`).
 */
export function parsePriceInput(
  text: string,
  separators: NumberSeparators = numberSeparators(),
): OrderInputResult<number> {
  const parts = decimalParts(text, PRICE_INPUT_DECIMALS, separators);
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
 * A limit or stop as the price field shows it, the inverse of `parsePriceInput`: no grouping, the
 * decimal separator, two to four decimal places (`99,50`, `1234,50`, `0,0125`; English `99.50`).
 * It fills the fields of a change with the order's prices (US-HD-04).
 */
export function formatPriceInput(
  price: number,
  separators: NumberSeparators = numberSeparators(),
): string {
  const units = Math.round(price * PRICE_INPUT_SCALE);
  const integer = String(Math.trunc(units / PRICE_INPUT_SCALE));
  const fraction = String(units % PRICE_INPUT_SCALE)
    .padStart(PRICE_INPUT_DECIMALS, '0')
    .replace(/0+$/, '')
    .padEnd(MIN_PRICE_INPUT_DECIMALS, '0');
  return `${integer}${separators.decimal}${fraction}`;
}

function decimalParts(
  text: string,
  maxDecimals: number,
  separators: NumberSeparators,
): { kind: 'empty' } | { kind: 'invalid' } | { kind: 'value'; value: DecimalParts } {
  const trimmed = text.replace(SURROUNDING, '');
  if (trimmed === '') {
    return { kind: 'empty' };
  }
  const match = decimalPattern(separators).exec(trimmed);
  if (match === null) {
    return { kind: 'invalid' };
  }
  const [, grouped, fraction = ''] = match;
  const integer = grouped.split(separators.group).join('');
  if (
    (integer === '' && fraction === '') ||
    integer.length > MAX_INTEGER_DIGITS ||
    fraction.length > maxDecimals
  ) {
    return { kind: 'invalid' };
  }
  return { kind: 'value', value: { integer, fraction } };
}

function decimalPattern({ group, decimal }: NumberSeparators): RegExp {
  const key = group + decimal;
  let pattern = DECIMAL_PATTERNS.get(key);
  if (pattern === undefined) {
    pattern = new RegExp(`^(\\d*|\\d{1,3}(?:\\${group}\\d{3})+)(?:\\${decimal}(\\d*))?$`);
    DECIMAL_PATTERNS.set(key, pattern);
  }
  return pattern;
}

interface DecimalParts {
  integer: string;
  fraction: string;
}
