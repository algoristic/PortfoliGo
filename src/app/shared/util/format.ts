import { formatLocale, perLocale } from './locale';

// Every format follows the language of `locale.ts` (TS §11.9); the examples below are German.

const HYPHEN_MINUS = '-';
/** Typographic minus sign (U+2212) for changes, as required by PS §10.4. */
const MINUS_SIGN = '\u2212';
/** Intl writes `GB` with a non-breaking space but `Byte` to `MB` with a normal one. */
const NO_BREAK_SPACE = '\u00a0';

const formats = new Map<string, Intl.NumberFormat>();
const dateTimeFormat = perLocale(
  (locale) =>
    new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
);

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

/**
 * Formats an amount of cents as euros, e.g. `123456` → `1.234,56 €`. `maxFractionDigits` (2–4)
 * shows fractions of a cent where they exist, e.g. a dividend per share (TS §6.5): `0.49` with 4 →
 * `0,0049 €`, `37.5` → `0,375 €`, `150` → `1,50 €`.
 */
export function formatCents(cents: number, maxFractionDigits = 2): string {
  return numberFormat({
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: maxFractionDigits,
  }).format(cents / 100);
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

/**
 * Formats a ratio as a percentage, e.g. `0.025` → `2,50 %`; negative ratios with the typographic
 * minus like the formats for changes, e.g. `−12,3 %` (PS §10.4).
 */
export function formatPercent(ratio: number, fractionDigits = 2): string {
  return withMinusSign(numberFormat(percentOptions(fractionDigits)).format(ratio));
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

/**
 * Like `formatPrice`, but for changes of a price: an explicit sign for values that don't round to
 * zero and a typographic minus, e.g. `+0,125 €`, `−1,20 €`. The caller chooses the decimal places
 * of the price itself (PS §10.4), not those of the change.
 */
export function formatSignedPrice(change: number, fractionDigits = 2): string {
  return withMinusSign(
    numberFormat({
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
      signDisplay: 'exceptZero',
    }).format(change),
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

/** Millionths per share: quantities are integer millionths (`MicroUnits`, TS §7.1). */
const MILLIONTHS_PER_UNIT = 1_000_000;
const MILLIONTHS_DIGITS = 6;

/**
 * Formats a number of shares given in millionths with as many decimal places as they need, e.g.
 * `10000000` → `10`, `500000` → `0,5`, `1234567` → `1,234567`.
 */
export function formatQuantity(millionths: number): string {
  let digits = MILLIONTHS_DIGITS;
  for (let step = 10; digits > 0 && millionths % step === 0; step *= 10) {
    digits--;
  }
  return formatNumber(millionths / MILLIONTHS_PER_UNIT, digits);
}

/** Formats large numbers in short form, e.g. `1234567` → `1,2 Mio.`. */
export function formatCompact(value: number): string {
  return numberFormat({ notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/**
 * Large amounts of euros in short form for overviews (PS §10.4), at most one decimal place, e.g.
 * `1234567890` → `1,2 Mrd. €`, `850000000` → `850 Mio. €`.
 */
export function formatCompactEuros(euros: number): string {
  return withMinusSign(
    numberFormat({
      notation: 'compact',
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(euros),
  );
}

/** Byte units of `formatBytes`, decimal like the browsers' storage figures. */
const BYTE_UNITS = [
  { unit: 'byte', size: 1, fractionDigits: 0 },
  { unit: 'kilobyte', size: 1e3, fractionDigits: 1 },
  { unit: 'megabyte', size: 1e6, fractionDigits: 1 },
  { unit: 'gigabyte', size: 1e9, fractionDigits: 1 },
] as const;

/**
 * A size in bytes with the largest decimal unit that keeps the number below 1.000 after rounding,
 * at most one decimal place (PS §10.4), e.g. `512` → `512 Byte`, `1_234_567` → `1,2 MB`.
 */
export function formatBytes(bytes: number): string {
  const magnitude = Math.abs(bytes);
  let index = 0;
  while (index < BYTE_UNITS.length - 1 && magnitude >= BYTE_UNITS[index + 1].size) {
    index++;
  }
  const { size, fractionDigits } = BYTE_UNITS[index];
  const factor = 10 ** fractionDigits;
  if (index < BYTE_UNITS.length - 1 && Math.round((magnitude / size) * factor) >= 1000 * factor) {
    index++;
  }
  const chosen = BYTE_UNITS[index];
  return numberFormat({
    style: 'unit',
    unit: chosen.unit,
    maximumFractionDigits: chosen.fractionDigits,
  })
    .format(bytes / chosen.size)
    .replace(' ', NO_BREAK_SPACE);
}

/**
 * Date and time of a wall-clock instant (ms since the Unix epoch) in the browser's time zone,
 * e.g. `12.11.2026, 14:30` (English `12/11/2026, 14:30`). Game times use `formatGameTime` (`clock/domain`) instead.
 */
export function formatDateTime(epochMs: number): string {
  return dateTimeFormat().format(epochMs);
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
  const locale = formatLocale();
  const key = `${locale} ${JSON.stringify(options)}`;
  let format = formats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    formats.set(key, format);
  }
  return format;
}
