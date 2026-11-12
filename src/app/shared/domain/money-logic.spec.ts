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

describe('money-logic', () => {
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
  });
});
