const LOCALE = 'de-DE';
const HYPHEN_MINUS = '-';
/** Typographic minus sign (U+2212) for changes, as required by PS §10.4. */
const MINUS_SIGN = '\u2212';

const formats = new Map<string, Intl.NumberFormat>();

/** Shown instead of a missing or non-finite value. */
export const MISSING_VALUE = '–';

/** Formats finite numbers with `format`; `null`, `undefined`, `NaN` and ±∞ yield `MISSING_VALUE`. */
export function formatOptional<T extends number>(
  value: T | null | undefined,
  format: (value: T) => string,
): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? MISSING_VALUE
    : format(value);
}

/** Formats an amount of cents as euros, e.g. `123456` → `1.234,56 €`. */
export function formatCents(cents: number): string {
  return numberFormat({ style: 'currency', currency: 'EUR' }).format(cents / 100);
}

/** Formats a price in euros with a fixed number of decimal places, e.g. `8.002` → `8,002 €`. */
export function formatPrice(price: number, fractionDigits = 2): string {
  return numberFormat({
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(price);
}

/** Formats a ratio as a percentage, e.g. `0.025` → `2,50 %`. */
export function formatPercent(ratio: number, fractionDigits = 2): string {
  return numberFormat(percentOptions(fractionDigits)).format(ratio);
}

/**
 * Like `formatPercent`, but for changes: an explicit sign for values that don't round to zero
 * and a typographic minus, e.g. `+2,50 %`, `−2,50 %`.
 */
export function formatSignedPercent(ratio: number, fractionDigits = 2): string {
  return withMinusSign(
    numberFormat({ ...percentOptions(fractionDigits), signDisplay: 'exceptZero' }).format(ratio),
  );
}

/** Like `formatCents`, but for changes, e.g. `+312,40 €`, `−45,10 €`. */
export function formatSignedCents(cents: number): string {
  return withMinusSign(
    numberFormat({ style: 'currency', currency: 'EUR', signDisplay: 'exceptZero' }).format(
      cents / 100,
    ),
  );
}

/** Formats a plain number with grouping, e.g. `12345.6` → `12.346`. */
export function formatNumber(value: number, fractionDigits = 0): string {
  return numberFormat({
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Formats large numbers in short form, e.g. `1234567` → `1,2 Mio.`. */
export function formatCompact(value: number): string {
  return numberFormat({ notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function withMinusSign(formatted: string): string {
  return formatted.replace(HYPHEN_MINUS, MINUS_SIGN);
}

function percentOptions(fractionDigits: number): Intl.NumberFormatOptions {
  return {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  };
}

function numberFormat(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let format = formats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(LOCALE, options);
    formats.set(key, format);
  }
  return format;
}
