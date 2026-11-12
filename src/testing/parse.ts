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
