// Text of an amount input in German number format (TS §11.8). Amounts are integer cents; the
// functions don't know the `Cents` type because `util` does not depend on `domain`.

/** Result of reading an amount field: empty, not a valid amount, or a whole number of cents. */
export type AmountInputResult =
  { kind: 'empty' } | { kind: 'invalid' } | { kind: 'amount'; cents: number };

const CENTS_PER_EURO = 100;
/** Up to 13 integer digits, so that every amount is exact in cents (below 2⁵³). */
const MAX_INTEGER_DIGITS = 13;

// Sign, then the euros either without separators or with a dot every three digits, then up to two
// decimal places after a comma. `,5` and `10,` are accepted as `0,50` and `10`.
const AMOUNT_PATTERN = /^([-−]?)(\d*|\d{1,3}(?:\.\d{3})+)(?:,(\d{0,2}))?$/;
// Whitespace (including no-break spaces from copied amounts) and an optional euro sign at the end.
const SURROUNDING = /^\s+|\s*€?\s*$/g;

/**
 * Reads an amount as the user types it: `10.000`, `10000,5`, `1.234,56`, `-3,2`, optionally with
 * ` €`. Dots group thousands, a comma separates up to two decimal places.
 */
export function parseAmountInput(text: string): AmountInputResult {
  const trimmed = text.replace(SURROUNDING, '');
  if (trimmed === '') {
    return { kind: 'empty' };
  }
  const match = AMOUNT_PATTERN.exec(trimmed);
  if (match === null) {
    return { kind: 'invalid' };
  }
  const [, sign, grouped, fraction = ''] = match;
  const integer = grouped.replace(/\./g, '');
  if ((integer === '' && fraction === '') || integer.length > MAX_INTEGER_DIGITS) {
    return { kind: 'invalid' };
  }
  const cents = Number(integer || '0') * CENTS_PER_EURO + Number(fraction.padEnd(2, '0'));
  return { kind: 'amount', cents: sign === '' || cents === 0 ? cents : -cents };
}

const WHOLE_EUROS = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const WITH_CENTS = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Text of an amount in the input after editing: thousands grouped, decimal places only when the
 * amount has cents, no currency (the input shows `€` next to it), e.g. `1000000` → `10.000`,
 * `123456` → `1.234,56`. `parseAmountInput` reads it back to the same amount.
 */
export function formatAmountInput(cents: number): string {
  // `|| 0` turns −0 into 0, which Intl would show as `-0`.
  const euros = (cents || 0) / CENTS_PER_EURO;
  return cents % CENTS_PER_EURO === 0 ? WHOLE_EUROS.format(euros) : WITH_CENTS.format(euros);
}
