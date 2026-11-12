import fc from 'fast-check';

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

const arbValues = (minLength: number): fc.Arbitrary<number[]> =>
  fc.array(fc.double({ min: -1e6, max: 1e6, noNaN: true }), { minLength, maxLength: 50 });

/** `|a − b| ≤ tolerance · scale`, for values computed in a different order. */
function expectClose(a: number, b: number, scale: number, tolerance = 1e-9): void {
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tolerance * Math.max(1, scale));
}

describe('statistics-logic', () => {
  // Textbook example with hand-computed moments.
  const values = [2, 4, 4, 4, 5, 5, 7, 9];

  describe('mean, variance and standardDeviation', () => {
    it('computes the sample moments', () => {
      expect(mean(values)).toBe(5);
      expect(variance(values)).toBeCloseTo(32 / 7, 12);
      expect(standardDeviation(values)).toBeCloseTo(Math.sqrt(32 / 7), 12);
    });

    it('returns NaN when there are too few values', () => {
      expect(mean([])).toBeNaN();
      expect(variance([])).toBeNaN();
      expect(variance([1])).toBeNaN();
      expect(standardDeviation([])).toBeNaN();
    });

    it('keep the mean between minimum and maximum', () => {
      fc.assert(
        fc.property(arbValues(1), (xs) => {
          expect(mean(xs)).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-9);
          expect(mean(xs)).toBeLessThanOrEqual(Math.max(...xs) + 1e-9);
        }),
      );
    });

    it('do not change the variance under a shift and scale it by a²', () => {
      fc.assert(
        fc.property(
          arbValues(2),
          fc.double({ min: -1e3, max: 1e3, noNaN: true }),
          fc.double({ min: 0.01, max: 100, noNaN: true }),
          (xs, shift, factor) => {
            const v = variance(xs);
            expect(v).toBeGreaterThanOrEqual(0);
            expectClose(
              variance(xs.map((x) => x + shift)),
              v,
              v + Math.max(...xs.map(Math.abs)) ** 2,
              1e-9,
            );
            expectClose(
              variance(xs.map((x) => factor * x)),
              factor * factor * v,
              factor * factor * v,
              1e-9,
            );
          },
        ),
      );
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

    it('returns NaN without a positive start value', () => {
      expect(geometricReturn(0, 121, 1)).toBeNaN();
      expect(geometricReturn(-100, 121, 1)).toBeNaN();
    });
  });

  describe('correlation', () => {
    it('computes the Pearson correlation', () => {
      expect(correlation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 12);
      expect(correlation([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 12);
      // Σdxdy = 4, Σdx² = Σdy² = 5 → 4 / 5
      expect(correlation([1, 2, 3, 4], [1, 3, 2, 4])).toBeCloseTo(0.8, 12);
    });

    it('is ±1 for two points', () => {
      expect(correlation([1, 2], [3, 5])).toBeCloseTo(1, 12);
      expect(correlation([1, 2], [5, 3])).toBeCloseTo(-1, 12);
    });

    it('lies in [−1, 1] and is invariant under positive affine maps', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: -1000, max: 1000 })),
            {
              minLength: 3,
              maxLength: 40,
            },
          ),
          fc.double({ min: 0.1, max: 10, noNaN: true }),
          fc.double({ min: -100, max: 100, noNaN: true }),
          (pairs, factor, shift) => {
            const xs = pairs.map(([x]) => x);
            const ys = pairs.map(([, y]) => y);
            const r = correlation(xs, ys);
            fc.pre(Number.isFinite(r));
            expect(Math.abs(r)).toBeLessThanOrEqual(1 + 1e-12);
            expectClose(
              correlation(
                xs.map((x) => factor * x + shift),
                ys,
              ),
              r,
              1,
              1e-9,
            );
            expectClose(
              correlation(
                xs.map((x) => -factor * x + shift),
                ys,
              ),
              -r,
              1,
              1e-9,
            );
          },
        ),
      );
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

    it('returns NaN for constant or no values', () => {
      expect(kurtosis([3, 3, 3])).toBeNaN();
      expect(skewness([3, 3, 3])).toBeNaN();
      expect(kurtosis([])).toBeNaN();
      expect(skewness([])).toBeNaN();
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
      expect(quantile([], 0.5)).toBeNaN();
    });

    it('returns NaN for q outside [0, 1]', () => {
      expect(quantile([1, 2, 3], 1.2)).toBeNaN();
      expect(quantile([1, 2, 3], -0.2)).toBeNaN();
    });

    it('returns the ranked values at q = k / (n − 1) and stays monotone in between', () => {
      fc.assert(
        fc.property(arbValues(1), fc.double({ min: 0, max: 1, noNaN: true }), (xs, q) => {
          const sorted = [...xs].sort((a, b) => a - b);
          const n = sorted.length;
          for (let k = 0; k < n; k++) {
            // Numeric equality: −0 and 0 count as the same rank value here.
            expect(quantile(sorted, n === 1 ? 0 : k / (n - 1)) === sorted[k]).toBe(true);
          }
          const value = quantile(sorted, q);
          expect(value).toBeGreaterThanOrEqual(sorted[0]);
          expect(value).toBeLessThanOrEqual(sorted[n - 1]);
          expect(quantile(sorted, Math.min(1, q + 0.1))).toBeGreaterThanOrEqual(value);
        }),
      );
    });

    it('takes the middle value or the mean of the two middle values as median', () => {
      fc.assert(
        fc.property(arbValues(1), (xs) => {
          const sorted = [...xs].sort((a, b) => a - b);
          const middle = Math.floor(sorted.length / 2);
          const expected =
            sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
          // The rounding error scales with the middle values, not with their mean (which may be
          // close to 0 for values of opposite sign).
          const scale = Math.max(
            Math.abs(sorted[Math.max(0, middle - 1)]),
            Math.abs(sorted[middle]),
          );
          expectClose(median(xs), expected, scale, 1e-12);
        }),
      );
    });
  });

  describe('histogram', () => {
    it('counts values per bucket and outside the range', () => {
      const result = histogram([-2, 0, 0.4, 0.5, 1, 3], 2, 0, 1);
      expect(result).toEqual({ min: 0, max: 1, binWidth: 0.5, counts: [2, 2], below: 1, above: 1 });
    });

    it('counts every value exactly once', () => {
      fc.assert(
        fc.property(arbValues(0), fc.integer({ min: 1, max: 20 }), (xs, bins) => {
          const { counts, below, above } = histogram(xs, bins, -1e5, 1e5);
          expect(counts.reduce((sum, count) => sum + count, 0) + below + above).toBe(xs.length);
          expect(below).toBe(xs.filter((x) => x < -1e5).length);
          expect(above).toBe(xs.filter((x) => x > 1e5).length);
        }),
      );
    });

    it('uses buckets of (max − min) / bins from min on', () => {
      // Width (3 − 1) / 2 = 1: [1, 2) and [2, 3], where 3 belongs to the last bucket.
      const result = histogram([1, 1.5, 2, 2.9, 3], 2, 1, 3);
      expect(result).toEqual({ min: 1, max: 3, binWidth: 1, counts: [2, 3], below: 0, above: 0 });
    });

    it('rejects invalid bins and empty ranges', () => {
      expect(() => histogram([1], 0, 0, 1)).toThrow(RangeError);
      expect(() => histogram([1], 1.5, 0, 1)).toThrow(RangeError);
      expect(() => histogram([1], 2, 1, 1)).toThrow(RangeError);
      expect(() => histogram([1], 2, 1, 0)).toThrow(RangeError);
    });
  });
});
