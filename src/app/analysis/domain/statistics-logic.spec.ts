import {
  annualizedVolatility,
  autocorrelation,
  correlation,
  geometricReturn,
  histogram,
  kurtosis,
  logReturns,
  mean,
  median,
  quantile,
  skewness,
  standardDeviation,
  variance,
} from './statistics-logic';

describe('statistics-logic', () => {
  const values = [2, 4, 4, 4, 5, 5, 7, 9];

  describe('mean, variance and standardDeviation', () => {
    it('computes the sample moments', () => {
      expect(mean(values)).toBe(5);
      expect(variance(values)).toBeCloseTo(32 / 7, 12);
      expect(standardDeviation(values)).toBeCloseTo(Math.sqrt(32 / 7), 12);
    });

    it('returns NaN when there are too few values', () => {
      expect(mean([])).toBeNaN();
      expect(variance([1])).toBeNaN();
    });
  });

  describe('logReturns and annualizedVolatility', () => {
    it('computes log returns between neighbours', () => {
      const returns = logReturns([100, 110, 99]);
      expect(returns).toHaveLength(2);
      expect(returns[0]).toBeCloseTo(Math.log(1.1), 12);
      expect(returns[1]).toBeCloseTo(Math.log(0.9), 12);
    });

    it('scales the standard deviation with the square root of the periods', () => {
      expect(annualizedVolatility(values, 4)).toBeCloseTo(2 * Math.sqrt(32 / 7), 12);
    });
  });

  describe('geometricReturn', () => {
    it('returns the compound annual growth rate', () => {
      expect(geometricReturn(100, 121, 2)).toBeCloseTo(0.1, 12);
      expect(geometricReturn(100, 50, 1)).toBeCloseTo(-0.5, 12);
    });

    it('returns NaN without a positive period', () => {
      expect(geometricReturn(100, 121, 0)).toBeNaN();
    });
  });

  describe('correlation', () => {
    it('computes the Pearson correlation', () => {
      expect(correlation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 12);
      expect(correlation([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 12);
      // Σdxdy = 2.5, Σdx² = 5, Σdy² = 5.75 → 2.5 / √28.75
      expect(correlation([1, 2, 3, 4], [1, 3, 2, 4])).toBeCloseTo(0.8, 12);
    });

    it('returns NaN for constant series and different lengths', () => {
      expect(correlation([1, 1, 1], [1, 2, 3])).toBeNaN();
      expect(correlation([1, 2], [1, 2, 3])).toBeNaN();
    });
  });

  describe('skewness and kurtosis', () => {
    it('computes the standardized population moments', () => {
      // m2 = 4, m3 = 5.25, m4 = 44.5 for [2, 4, 4, 4, 5, 5, 7, 9]
      expect(skewness(values)).toBeCloseTo(5.25 / 8, 12);
      expect(kurtosis(values)).toBeCloseTo(44.5 / 16, 12);
    });

    it('is 1 for a symmetric two-point distribution', () => {
      expect(kurtosis([-1, 1, -1, 1])).toBeCloseTo(1, 12);
      expect(skewness([-1, 1, -1, 1])).toBeCloseTo(0, 12);
    });

    it('returns NaN for constant values', () => {
      expect(kurtosis([3, 3, 3])).toBeNaN();
    });
  });

  describe('autocorrelation', () => {
    it('computes the sample autocorrelation', () => {
      // mean 2.5, deviations −1.5 −0.5 0.5 1.5; lag 1: (0.75 − 0.25 + 0.75) / 5
      expect(autocorrelation([1, 2, 3, 4], 1)).toBeCloseTo(0.25, 12);
      expect(autocorrelation([1, -1, 1, -1, 1, -1], 1)).toBeCloseTo(-5 / 6, 12);
    });

    it('returns NaN for a lag outside the series', () => {
      expect(autocorrelation([1, 2, 3], 3)).toBeNaN();
      expect(autocorrelation([1, 2, 3], 0)).toBeNaN();
    });
  });

  describe('quantile and median', () => {
    it('interpolates linearly between ranks', () => {
      expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
      expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75);
      expect(quantile([1, 2, 3, 4], 1)).toBe(4);
      expect(median([5, 1, 3])).toBe(3);
    });

    it('returns NaN for no values', () => {
      expect(median([])).toBeNaN();
    });
  });

  describe('histogram', () => {
    it('counts values per bucket and outside the range', () => {
      const result = histogram([-2, 0, 0.4, 0.5, 1, 3], 2, 0, 1);
      expect(result).toEqual({ min: 0, max: 1, binWidth: 0.5, counts: [2, 2], below: 1, above: 1 });
    });

    it('rejects invalid bins', () => {
      expect(() => histogram([1], 0, 0, 1)).toThrow(RangeError);
    });
  });
});
