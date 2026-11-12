import {
  formatCents,
  formatCompact,
  formatNumber,
  formatOptional,
  formatPercent,
  formatPrice,
  formatSignedCents,
  formatSignedPercent,
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
      expect(formatPercent(-0.1234, 1)).toBe(`-12,3${NBSP}%`);
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

  describe('formatNumber', () => {
    it('groups thousands and rounds to the given decimal places', () => {
      expect(formatNumber(12_345.6)).toBe('12.346');
      expect(formatNumber(1.25, 1)).toBe('1,3');
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
