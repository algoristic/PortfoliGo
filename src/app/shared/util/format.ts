const LOCALE = 'de-DE';

const formats = new Map<string, Intl.NumberFormat>();

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

/** Like `formatPercent`, but with an explicit sign for non-zero values, e.g. `+2,50 %`. */
export function formatSignedPercent(ratio: number, fractionDigits = 2): string {
  return numberFormat({ ...percentOptions(fractionDigits), signDisplay: 'exceptZero' }).format(
    ratio,
  );
}

/** Formats large numbers in short form, e.g. `1234567` → `1,2 Mio.`. */
export function formatCompact(value: number): string {
  return numberFormat({ notation: 'compact', maximumFractionDigits: 1 }).format(value);
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
