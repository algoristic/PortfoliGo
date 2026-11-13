// Reads numbers as the German UI shows them, independently of `shared/util/format` (the oracle
// of a page test must not be the code under test, TS §14.1).

/** Parses e.g. `'1.234,5'`, `'−3,2 %'` or `'15,3 %'` (percent as a ratio: 0.153). */
export function parseGermanNumber(text: string): number {
  const trimmed = text.replace(/\s/g, '').replace(/−/g, '-');
  const isPercent = trimmed.endsWith('%');
  const digits = (isPercent ? trimmed.slice(0, -1) : trimmed).replace(/\./g, '').replace(',', '.');
  if (!/^[-+]?\d+(\.\d+)?$/.test(digits)) {
    throw new Error(`not a German number: ${text}`);
  }
  const value = Number(digits);
  return isPercent ? value / 100 : value;
}

/** Parses an amount in euros as the UI shows it, e.g. `'10.000,00 €'` or `'−3,20 €'`. */
export function parseEuros(text: string): number {
  return parseGermanNumber(text.replace(/€\s*$/, ''));
}

const COMPACT_FACTORS: Readonly<Record<string, number>> = {
  '': 1,
  'Tsd.': 1e3,
  'Mio.': 1e6,
  'Mrd.': 1e9,
  'Bio.': 1e12,
};

/**
 * Parses a compact amount in euros as the UI shows it, e.g. `'1,2 Mrd. €'` → 1.2e9, together with
 * the factor of its unit, so that a test can compare at the displayed precision.
 */
export function parseCompactEuros(text: string): { value: number; factor: number } {
  const match = /^([-−+]?[\d.,]+)\s*(Tsd\.|Mio\.|Mrd\.|Bio\.)?\s*€$/.exec(text.trim());
  if (match === null) {
    throw new Error(`not a compact amount: ${text}`);
  }
  const factor = COMPACT_FACTORS[match[2] ?? ''];
  return { value: parseGermanNumber(match[1]) * factor, factor };
}
