// Text of an amount input in the number format of the language (TS §11.8, §11.9). Amounts are
// integer cents; the functions don't know the `Cents` type because `util` does not depend on
// `domain`.

import { numberSeparators, NumberSeparators, perLocale } from './locale';

/** Result of reading an amount field: empty, not a valid amount, or a whole number of cents. */
export type AmountInputResult =
  { kind: 'empty' } | { kind: 'invalid' } | { kind: 'amount'; cents: number };

const CENTS_PER_EURO = 100;
/** Up to 13 integer digits, so that every amount is exact in cents (below 2⁵³). */
const MAX_INTEGER_DIGITS = 13;

// Sign, then the euros either without separators or with a group separator every three digits,
// then up to two decimal places after the decimal separator. In German `,5` and `10,` are accepted
// as `0,50` and `10`.
const amountPattern = (group: string, decimal: string): RegExp =>
  new RegExp(`^([-−]?)(\\d*|\\d{1,3}(?:\\${group}\\d{3})+)(?:\\${decimal}(\\d{0,2}))?$`);
const AMOUNT_PATTERNS = new Map<string, RegExp>();
// Whitespace (including no-break spaces from copied amounts) and an optional euro sign at the end.
const SURROUNDING = /^\s+|\s*€?\s*$/g;

/**
 * Reads an amount as the user types it: `10.000`, `10000,5`, `1.234,56`, `-3,2`, optionally with
 * ` €`. In German dots group thousands and a comma separates up to two decimal places; in English
 * it is the other way round (`1,234.56`). The separators default to those of the language.
 */
export function parseAmountInput(
  text: string,
  separators: NumberSeparators = numberSeparators(),
): AmountInputResult {
  const trimmed = text.replace(SURROUNDING, '');
  if (trimmed === '') {
    return { kind: 'empty' };
  }
  const match = patternOf(separators).exec(trimmed);
  if (match === null) {
    return { kind: 'invalid' };
  }
  const [, sign, grouped, fraction = ''] = match;
  const integer = grouped.split(separators.group).join('');
  if ((integer === '' && fraction === '') || integer.length > MAX_INTEGER_DIGITS) {
    return { kind: 'invalid' };
  }
  const cents = Number(integer || '0') * CENTS_PER_EURO + Number(fraction.padEnd(2, '0'));
  return { kind: 'amount', cents: sign === '' || cents === 0 ? cents : -cents };
}

const wholeEuros = perLocale(
  (locale) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }),
);
const withCents = perLocale(
  (locale) => new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
);

/**
 * Text of an amount in the input after editing: thousands grouped, decimal places only when the
 * amount has cents, no currency (the input shows `€` next to it), e.g. `1000000` → `10.000`,
 * `123456` → `1.234,56` (English `10,000`, `1,234.56`). `parseAmountInput` reads it back to the
 * same amount in the same language.
 */
export function formatAmountInput(cents: number): string {
  // `|| 0` turns −0 into 0, which Intl would show as `-0`.
  const euros = (cents || 0) / CENTS_PER_EURO;
  return cents % CENTS_PER_EURO === 0 ? wholeEuros().format(euros) : withCents().format(euros);
}

function patternOf({ group, decimal }: NumberSeparators): RegExp {
  const key = group + decimal;
  let pattern = AMOUNT_PATTERNS.get(key);
  if (pattern === undefined) {
    pattern = amountPattern(group, decimal);
    AMOUNT_PATTERNS.set(key, pattern);
  }
  return pattern;
}
