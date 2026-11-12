import fc from 'fast-check';

import {
  applyRate,
  centsToEuros,
  eurosToCents,
  eurosToCentsDown,
  marketValue,
  microUnitsToUnits,
  roundHalfAwayFromZero,
  unitsToMicroUnits,
} from './money-logic';

/** Money is exact up to ±9 · 10¹⁵ cents (TS §7.1). */
const MAX_CENTS = 9e15;
const arbCents = fc.integer({ min: -MAX_CENTS, max: MAX_CENTS });

describe('money-logic', () => {
  // Rounding rules of TS §7.1: commercial rounding (half away from zero), artefact correction to
  // 15 significant digits only below 10¹⁵.
  describe('roundHalfAwayFromZero', () => {
    it('rounds halves away from zero', () => {
      expect(roundHalfAwayFromZero(2.5)).toBe(3);
      expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
      expect(roundHalfAwayFromZero(2.4999)).toBe(2);
      expect(roundHalfAwayFromZero(-2.4999)).toBe(-2);
    });

    it('rounds binary artefacts of decimal halves as written', () => {
      expect(roundHalfAwayFromZero(1.005 * 100)).toBe(101);
      expect(roundHalfAwayFromZero(-1.005 * 100)).toBe(-101);
      expect(roundHalfAwayFromZero(0.285 * 100)).toBe(29);
    });

    it('returns positive zero for values that round to zero', () => {
      expect(Object.is(roundHalfAwayFromZero(-0.4), 0)).toBe(true);
    });

    it('is symmetric around zero and returns positive zero', () => {
      fc.assert(
        fc.property(fc.double({ min: -1e17, max: 1e17, noNaN: true }), (value) => {
          const rounded = roundHalfAwayFromZero(value);
          expect(Object.is(roundHalfAwayFromZero(-value), rounded === 0 ? 0 : -rounded)).toBe(true);
          expect(Object.is(rounded, -0)).toBe(false);
        }),
      );
    });

    it('rounds to the nearest integer up to the 15-digit correction', () => {
      fc.assert(
        fc.property(fc.double({ min: -1e15, max: 1e15, noNaN: true }), (value) => {
          const rounded = roundHalfAwayFromZero(value);
          expect(Number.isInteger(rounded)).toBe(true);
          // Reducing to 15 significant digits moves the value by at most 5 · 10⁻¹⁵ relative.
          expect(Math.abs(rounded - value)).toBeLessThanOrEqual(
            0.5 + 1e-14 * Math.max(1, Math.abs(value)),
          );
        }),
      );
    });

    it('keeps every integer up to ±9 · 10¹⁵', () => {
      fc.assert(
        fc.property(arbCents, (cents) => {
          expect(roundHalfAwayFromZero(cents)).toBe(cents === 0 ? 0 : cents);
        }),
      );
    });

    it('keeps integers from 10¹⁵ cents on exact', () => {
      expect(roundHalfAwayFromZero(1_234_567_890_123_456)).toBe(1_234_567_890_123_456);
      expect(roundHalfAwayFromZero(-9_007_199_254_740_991)).toBe(-9_007_199_254_740_991);
      expect(roundHalfAwayFromZero(999_999_999_999_999)).toBe(999_999_999_999_999);
    });
  });

  describe('eurosToCents', () => {
    it('converts euros to integer cents', () => {
      expect(eurosToCents(1234.56)).toBe(123456);
      expect(eurosToCents(1.005)).toBe(101);
      expect(eurosToCents(-0.015)).toBe(-2);
    });

    it('round-trips with centsToEuros below 10¹⁵ cents', () => {
      // Above 10¹⁵ cents (10¹³ €) a double in euros can no longer hold whole cents, so the round
      // trip may miss by one cent there (e.g. 8999578632460963); amounts stay exact as cents.
      fc.assert(
        fc.property(fc.integer({ min: -(1e15 - 1), max: 1e15 - 1 }), (cents) => {
          expect(eurosToCents(centsToEuros(cents))).toBe(cents === 0 ? 0 : cents);
        }),
      );
    });
  });

  describe('eurosToCentsDown', () => {
    it('rounds down to whole cents as written', () => {
      expect(eurosToCentsDown(0.29)).toBe(29);
      expect(eurosToCentsDown(1.239)).toBe(123);
      expect(eurosToCentsDown(12.5)).toBe(1250);
    });

    it('returns positive zero below one cent', () => {
      expect(Object.is(eurosToCentsDown(0.004), 0)).toBe(true);
      expect(Object.is(eurosToCentsDown(-0), 0)).toBe(true);
    });

    it('keeps whole cents as written', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1e13 }), (cents) => {
          expect(eurosToCentsDown(centsToEuros(cents))).toBe(cents);
        }),
      );
    });

    it('never rounds up', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1e12 }),
          fc.integer({ min: 0, max: 99 }),
          (cents, tenths) => {
            // `cents` whole cents plus up to 0.99 of a cent, written with three decimals in euros.
            expect(eurosToCentsDown((cents * 100 + tenths) / 10_000)).toBe(
              Math.floor((cents * 100 + tenths) / 100),
            );
          },
        ),
      );
    });
  });

  describe('centsToEuros', () => {
    it('converts cents to euros', () => {
      expect(centsToEuros(123456)).toBe(1234.56);
    });
  });

  describe('unitsToMicroUnits', () => {
    it('converts units to millionths and back', () => {
      expect(unitsToMicroUnits(1.234567)).toBe(1_234_567);
      expect(unitsToMicroUnits(0.0000005)).toBe(1);
      expect(microUnitsToUnits(1_234_567)).toBe(1.234567);
    });

    it('round-trips with microUnitsToUnits', () => {
      fc.assert(
        fc.property(fc.integer({ min: -1e15, max: 1e15 }), (microUnits) => {
          expect(unitsToMicroUnits(microUnitsToUnits(microUnits))).toBe(
            microUnits === 0 ? 0 : microUnits,
          );
        }),
      );
    });
  });

  describe('marketValue', () => {
    it('multiplies quantity and price and rounds to cents', () => {
      expect(marketValue(10_000_000, 12.345)).toBe(12345);
      expect(marketValue(1_500_000, 8.003)).toBe(1200);
      expect(marketValue(333_333, 3)).toBe(100);
    });

    it('rounds half cents away from zero', () => {
      expect(marketValue(500_000, 0.01)).toBe(1);
    });
  });

  describe('applyRate', () => {
    it('applies a rate and rounds to cents', () => {
      expect(applyRate(10_000, 0.025)).toBe(250);
      expect(applyRate(999, 0.25)).toBe(250);
      expect(applyRate(-999, 0.25)).toBe(-250);
    });

    it('is odd in the amount', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1e12, max: 1e12 }),
          fc.double({ min: 0, max: 1, noNaN: true }),
          (amount, rate) => {
            const applied = applyRate(amount, rate);
            expect(Object.is(applyRate(-amount, rate), applied === 0 ? 0 : -applied)).toBe(true);
          },
        ),
      );
    });
  });
});
