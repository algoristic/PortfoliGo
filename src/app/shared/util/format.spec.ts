import {
  formatBytes,
  formatCents,
  formatCompact,
  formatCompactEuros,
  formatDateTime,
  formatNumber,
  formatOptional,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatSignedCents,
  formatSignedPercent,
  formatSignedPrice,
  MISSING_VALUE,
} from './format';

// Intl separates the number and the unit with a non-breaking space.
const NBSP = ' ';
const MINUS = '\u2212';

describe('format', () => {
  describe('formatCents', () => {
    it('formats cents as euros with German separators', () => {
      expect(formatCents(123456)).toBe(`1.234,56${NBSP}€`);
      expect(formatCents(-5)).toBe(`-0,05${NBSP}€`);
      expect(formatCents(0)).toBe(`0,00${NBSP}€`);
    });
  });

  describe('formatPrice', () => {
    it('uses two decimal places by default', () => {
      expect(formatPrice(123.4)).toBe(`123,40${NBSP}€`);
    });

    it('uses the given number of decimal places', () => {
      expect(formatPrice(8.002, 3)).toBe(`8,002${NBSP}€`);
      expect(formatPrice(0.5, 4)).toBe(`0,5000${NBSP}€`);
    });
  });

  describe('formatPercent', () => {
    it('formats ratios as percentages', () => {
      expect(formatPercent(0.025)).toBe(`2,50${NBSP}%`);
    });

    // PS §10.4: the typographic minus as in the formats for changes, also for large values (the
    // savings rate of a month before its salary)
    it('writes negative ratios with the typographic minus', () => {
      expect(formatPercent(-0.1234, 1)).toBe(`${MINUS}12,3${NBSP}%`);
      expect(formatPercent(-42.114, 1)).toBe(`${MINUS}4.211,4${NBSP}%`);
      expect(formatPercent(-0.025)).not.toContain('-');
    });
  });

  describe('formatSignedPercent', () => {
    it('adds a sign to non-zero values', () => {
      expect(formatSignedPercent(0.025)).toBe(`+2,50${NBSP}%`);
      expect(formatSignedPercent(-0.025)).toBe(`${MINUS}2,50${NBSP}%`);
    });

    it('omits the sign when the value rounds to zero', () => {
      expect(formatSignedPercent(0)).toBe(`0,00${NBSP}%`);
      expect(formatSignedPercent(-0.00001)).toBe(`0,00${NBSP}%`);
    });
  });

  describe('formatSignedCents', () => {
    it('adds a sign and uses the typographic minus', () => {
      expect(formatSignedCents(31240)).toBe(`+312,40${NBSP}€`);
      expect(formatSignedCents(-4510)).toBe(`${MINUS}45,10${NBSP}€`);
      expect(formatSignedCents(-123456)).toBe(`${MINUS}1.234,56${NBSP}€`);
    });

    it('omits the sign for zero', () => {
      expect(formatSignedCents(0)).toBe(`0,00${NBSP}€`);
      expect(formatSignedCents(-0)).toBe(`0,00${NBSP}€`);
    });
  });

  describe('formatSignedPrice', () => {
    // PS §10.4: the decimal places follow the price, so a change keeps those of its price.
    it('adds a sign and keeps the given decimal places', () => {
      expect(formatSignedPrice(0.125, 3)).toBe(`+0,125${NBSP}€`);
      expect(formatSignedPrice(-1.2)).toBe(`${MINUS}1,20${NBSP}€`);
      expect(formatSignedPrice(-1234.5)).toBe(`${MINUS}1.234,50${NBSP}€`);
      expect(formatSignedPrice(0.0005, 4)).toBe(`+0,0005${NBSP}€`);
    });

    it('omits the sign when the change rounds to zero', () => {
      expect(formatSignedPrice(0)).toBe(`0,00${NBSP}€`);
      expect(formatSignedPrice(-0.001)).toBe(`0,00${NBSP}€`);
    });
  });

  describe('formatCompactEuros', () => {
    // PS §10.4: compact amounts in overviews, e.g. `1,2 Mio. €`.
    it('abbreviates millions, billions and trillions with at most one decimal place', () => {
      expect(formatCompactEuros(1_234_000_000)).toBe(`1,2${NBSP}Mrd.${NBSP}€`);
      expect(formatCompactEuros(850_000_000)).toBe(`850${NBSP}Mio.${NBSP}€`);
      expect(formatCompactEuros(1_250_000)).toBe(`1,3${NBSP}Mio.${NBSP}€`);
      expect(formatCompactEuros(2_500_000_000_000)).toBe(`2,5${NBSP}Bio.${NBSP}€`);
    });

    it('keeps smaller amounts in full and uses the typographic minus', () => {
      expect(formatCompactEuros(12_345)).toBe(`12.345${NBSP}€`);
      expect(formatCompactEuros(-3_000_000_000)).toBe(`${MINUS}3${NBSP}Mrd.${NBSP}€`);
    });
  });

  describe('formatNumber', () => {
    it('groups thousands and rounds to the given decimal places', () => {
      expect(formatNumber(12_345.6)).toBe('12.346');
      expect(formatNumber(1.25, 1)).toBe('1,3');
    });
  });

  describe('formatQuantity', () => {
    it.each([
      [10_000_000, '10'],
      [500_000, '0,5'],
      [1_234_567, '1,234567'],
      [29_975_997, '29,975997'],
      [1_000, '0,001'],
      [12_345_000_000, '12.345'],
      [0, '0'],
    ])('shows %d millionths as %s', (millionths, expected) => {
      expect(formatQuantity(millionths)).toBe(expected);
    });
  });

  describe('formatCompact', () => {
    it('abbreviates millions and billions', () => {
      expect(formatCompact(1_234_567)).toBe(`1,2${NBSP}Mio.`);
      expect(formatCompact(2_500_000_000)).toBe(`2,5${NBSP}Mrd.`);
    });

    it('keeps smaller numbers in full', () => {
      expect(formatCompact(12_345)).toBe('12.345');
    });
  });

  describe('formatBytes', () => {
    // PS §10.4: storage sizes in decimal units with at most one decimal place and a
    // non-breaking space before the unit.
    it.each([
      [0, `0${NBSP}Byte`],
      [512, `512${NBSP}Byte`],
      [999, `999${NBSP}Byte`],
      [1_000, `1${NBSP}kB`],
      [12_345, `12,3${NBSP}kB`],
      [999_960, `1${NBSP}MB`],
      [1_500_000, `1,5${NBSP}MB`],
      [2_000_000_000, `2${NBSP}GB`],
      [1_234_000_000_000, `1.234${NBSP}GB`],
    ])('formats %d bytes as %s', (bytes, expected) => {
      expect(formatBytes(bytes)).toBe(expected);
    });
  });

  describe('formatDateTime', () => {
    // Instants built from local date parts: the result is the same in every time zone of the runner.
    it('formats an instant as local date and time with leading zeros', () => {
      expect(formatDateTime(new Date(2026, 10, 12, 14, 30).getTime())).toBe('12.11.2026, 14:30');
      expect(formatDateTime(new Date(2027, 0, 2, 3, 4, 59).getTime())).toBe('02.01.2027, 03:04');
    });
  });

  describe('formatOptional', () => {
    it('formats finite numbers with the given function', () => {
      expect(formatOptional(0, (value) => formatNumber(value, 1))).toBe('0,0');
      expect(formatOptional(-2.5, formatNumber)).toBe('-3');
    });

    it('returns MISSING_VALUE when the value is missing or not finite', () => {
      for (const value of [null, undefined, NaN, Infinity, -Infinity]) {
        expect(formatOptional(value, formatNumber)).toBe(MISSING_VALUE);
      }
    });
  });
});
