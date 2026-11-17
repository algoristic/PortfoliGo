import fc from 'fast-check';

import { kurtosis, mean, skewness, variance } from '@app/analysis/domain/statistics-logic';

import { detExp } from './det-math';
import {
  lognormal,
  normal,
  pick,
  poisson,
  POISSON_MAX_LAMBDA,
  shuffle,
  uniform,
  uniformInt,
  weightedIndex,
} from './distributions';
import { createStream, RandomStream } from './random-stream';
import { deriveSeedKey } from './seed';

import {
  binomialSe,
  expectWithinSigma,
  meanSe,
  poissonSe,
  varianceSe,
} from '../../../testing/statistics';

const seedKey = deriveSeedKey('distributions');

/** A fresh stream for every generated key, so properties see many different random sequences. */
const arbStream = fc.string({ maxLength: 12 }).map((key) => createStream(seedKey, `prop/${key}`));

/** A stream stub that returns a fixed `nextFloat53`, to reach the edges of [0, 1). */
function fixedFloat(u: number): RandomStream {
  return { nextFloat53: () => u } as unknown as RandomStream;
}

describe('distributions', () => {
  const n = 100_000;

  function draw(key: string, sample: (rng: RandomStream) => number): number[] {
    const rng = createStream(seedKey, key);
    return Array.from({ length: n }, () => sample(rng));
  }

  describe('uniform', () => {
    it('has the mean and variance of a uniform distribution', () => {
      const values = draw('uniform', (rng) => uniform(rng, -2, 6));
      const width = 8;
      // Var(s²) of a uniform distribution: (μ4 − σ⁴) / n with μ4 = w⁴/80 and σ² = w²/12.
      const varianceOfVariance = (width ** 4 / 80 - (width ** 2 / 12) ** 2) / n;
      expectWithinSigma(mean(values), 2, meanSe(width / Math.sqrt(12), n), 5, 'mean');
      expectWithinSigma(
        variance(values),
        width ** 2 / 12,
        Math.sqrt(varianceOfVariance),
        5,
        'variance',
      );
    });

    it('stays within [min, max] for every draw', () => {
      // `min + (max − min) · u` with u < 1 can still round to `max` when the range is tiny
      // compared to `min` (e.g. min = 1e6, max = 1e6 + 0.001, u = 1 − 2⁻⁵³), so the property
      // checks the closed interval.
      fc.assert(
        fc.property(
          fc.double({ min: -1e9, max: 1e9, noNaN: true }),
          fc.double({ min: 1e-6, max: 1e9, noNaN: true }),
          fc.double({ min: 0, max: 1 - 2 ** -53, noNaN: true }),
          (min, width, u) => {
            const max = min + width;
            const value = uniform(fixedFloat(u), min, max);
            expect(value).toBeGreaterThanOrEqual(min);
            expect(value).toBeLessThanOrEqual(max);
          },
        ),
      );
    });
  });

  describe('uniformInt', () => {
    it('covers both bounds with equal frequencies', () => {
      const trials = 60_000;
      const counts = new Array<number>(6).fill(0);
      const rng = createStream(seedKey, 'uniform-int');
      for (let i = 0; i < trials; i++) {
        counts[uniformInt(rng, 1, 6) - 1]++;
      }
      counts.forEach((count, face) =>
        expectWithinSigma(count / trials, 1 / 6, binomialSe(1 / 6, trials), 5, `face ${face + 1}`),
      );
    });

    it('returns an integer in [min, max] for every range of up to 2^32 values', () => {
      fc.assert(
        fc.property(
          arbStream,
          fc.integer({ min: -(2 ** 40), max: 2 ** 40 }),
          fc.integer({ min: 0, max: 2 ** 32 - 1 }),
          (rng, min, span) => {
            const value = uniformInt(rng, min, min + span);
            expect(Number.isInteger(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(min);
            expect(value).toBeLessThanOrEqual(min + span);
          },
        ),
      );
    });

    it('returns min for a single-value range', () => {
      expect(uniformInt(createStream(seedKey, 'uniform-int/single'), 5, 5)).toBe(5);
    });

    it('throws for invalid ranges', () => {
      const rng = createStream(seedKey, 'uniform-int/invalid');
      expect(() => uniformInt(rng, 3, 2)).toThrow(RangeError);
      expect(() => uniformInt(rng, 0, 1.5)).toThrow(RangeError);
      expect(() => uniformInt(rng, 0, 4294967296)).toThrow(RangeError);
    });
  });

  describe('normal', () => {
    it('has the moments of a standard normal distribution', () => {
      const values = draw('normal', normal);
      // Large-sample standard errors of skewness √(6/n) and kurtosis √(24/n) for a normal sample.
      expectWithinSigma(mean(values), 0, meanSe(1, n), 5, 'mean');
      expectWithinSigma(variance(values), 1, varianceSe(1, n), 5, 'variance');
      expectWithinSigma(skewness(values), 0, Math.sqrt(6 / n), 5, 'skewness');
      expectWithinSigma(kurtosis(values), 3, Math.sqrt(24 / n), 5, 'kurtosis');
    });

    it('applies mean and standard deviation', () => {
      const values = draw('normal/scaled', (rng) => normal(rng, 10, 3));
      expectWithinSigma(mean(values), 10, meanSe(3, n), 5, 'mean');
      expectWithinSigma(variance(values), 9, varianceSe(9, n), 5, 'variance');
    });

    it('uses the spare value of the polar method on every second call', () => {
      const rng = createStream(seedKey, 'normal/spare');
      normal(rng);
      expect(rng.normalSpare).not.toBeNull();
      const spare = rng.normalSpare;
      expect(normal(rng, 1, 2)).toBe(1 + 2 * (spare ?? NaN));
      expect(rng.normalSpare).toBeNull();
    });
  });

  describe('lognormal', () => {
    it('has mean exp(mu + sigma²/2)', () => {
      const mu = 0.1;
      const sigma = 0.25;
      const values = draw('lognormal', (rng) => lognormal(rng, mu, sigma));
      const expected = Math.exp(mu + sigma ** 2 / 2);
      const sd = Math.sqrt((Math.exp(sigma ** 2) - 1) * Math.exp(2 * mu + sigma ** 2));
      expectWithinSigma(mean(values), expected, meanSe(sd, n), 5, 'mean');
    });

    it('returns positive values only', () => {
      fc.assert(
        fc.property(arbStream, fc.double({ min: -5, max: 5, noNaN: true }), (rng, mu) => {
          expect(lognormal(rng, mu, 2)).toBeGreaterThan(0);
        }),
      );
    });
  });

  describe('poisson', () => {
    it.each([0.2, 3, 30])('has mean and variance lambda = %s', (lambda) => {
      const values = draw(`poisson/${lambda}`, (rng) => poisson(rng, lambda));
      expect(values.every((value) => Number.isInteger(value) && value >= 0)).toBe(true);
      // Var(s²) of a Poisson sample: (μ4 − σ⁴) / n with μ4 = λ(1 + 3λ).
      expectWithinSigma(mean(values), lambda, poissonSe(lambda, n), 5, 'mean');
      expectWithinSigma(
        variance(values),
        lambda,
        Math.sqrt((lambda + 2 * lambda * lambda) / n),
        5,
        'variance',
      );
    });

    it('returns 0 for lambda 0', () => {
      expect(poisson(createStream(seedKey, 'poisson/zero'), 0)).toBe(0);
    });

    it('draws the same values with a precomputed exp(-lambda)', () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 12 }),
          fc.double({ min: 0, max: POISSON_MAX_LAMBDA, noNaN: true }),
          (key, lambda) => {
            const plain = createStream(seedKey, key);
            const precomputed = createStream(seedKey, key);
            for (let i = 0; i < 20; i++) {
              expect(poisson(precomputed, lambda, detExp(-lambda))).toBe(poisson(plain, lambda));
            }
          },
        ),
      );
    });

    it('ends the search when rounding keeps the distribution function below u (7.1a-13)', () => {
      // The largest uniform 1 − 2⁻⁵³; before AP 7.3d λ = 3/252 ran on to k = 94 until p reached 0.
      const top = { nextFloat53: () => 1 - 2 ** -53 } as unknown as RandomStream;
      expect(poisson(top, 3 / 252)).toBeLessThanOrEqual(10);
      expect(poisson(top, 1)).toBeLessThanOrEqual(25);
    });

    it('throws for lambda outside the supported range', () => {
      const rng = createStream(seedKey, 'poisson/invalid');
      expect(() => poisson(rng, -1)).toThrow(RangeError);
      expect(() => poisson(rng, 31)).toThrow(RangeError);
      expect(() => poisson(rng, NaN)).toThrow(RangeError);
    });
  });

  describe('weightedIndex', () => {
    it('draws indices proportional to their weights', () => {
      const weights = [1, 0, 3, 6];
      const counts = [0, 0, 0, 0];
      const rng = createStream(seedKey, 'weighted');
      for (let i = 0; i < n; i++) {
        counts[weightedIndex(rng, weights)]++;
      }
      expect(counts[1]).toBe(0);
      for (const [index, p] of [
        [0, 0.1],
        [2, 0.3],
        [3, 0.6],
      ]) {
        expectWithinSigma(counts[index] / n, p, binomialSe(p, n), 5, `index ${index}`);
      }
    });

    it('never returns an index with weight 0', () => {
      const weights = fc
        .array(fc.oneof(fc.constant(0), fc.double({ min: 1e-9, max: 1e9, noNaN: true })), {
          minLength: 1,
          maxLength: 12,
        })
        .filter((list) => list.some((weight) => weight > 0));
      fc.assert(
        fc.property(arbStream, weights, (rng, list) => {
          for (let i = 0; i < 10; i++) {
            expect(list[weightedIndex(rng, list)]).toBeGreaterThan(0);
          }
        }),
      );
    });

    it('throws for invalid weights', () => {
      const rng = createStream(seedKey, 'weighted/invalid');
      expect(() => weightedIndex(rng, [])).toThrow(RangeError);
      expect(() => weightedIndex(rng, [0, 0])).toThrow(RangeError);
      expect(() => weightedIndex(rng, [1, -1])).toThrow(RangeError);
      expect(() => weightedIndex(rng, [1, NaN])).toThrow(RangeError);
      expect(() => weightedIndex(rng, [1, Infinity])).toThrow(RangeError);
    });
  });

  describe('shuffle', () => {
    it('returns a permutation of the items in place', () => {
      fc.assert(
        fc.property(arbStream, fc.array(fc.integer(), { maxLength: 40 }), (rng, items) => {
          const original = [...items];
          const shuffled = shuffle(rng, items);
          expect(shuffled).toBe(items);
          expect([...shuffled].sort((a, b) => a - b)).toEqual(original.sort((a, b) => a - b));
        }),
      );
    });

    it('is reproducible for the same stream', () => {
      const ordered = (): number[] => Array.from({ length: 50 }, (_, i) => i);
      const shuffled = shuffle(createStream(seedKey, 'shuffle'), ordered());
      expect(shuffled).not.toEqual(ordered());
      expect(shuffle(createStream(seedKey, 'shuffle'), ordered())).toEqual(shuffled);
    });

    it('places every item at every position with equal frequency', () => {
      const trials = 40_000;
      const rng = createStream(seedKey, 'shuffle/uniform');
      const counts = [0, 0, 0, 0];
      for (let i = 0; i < trials; i++) {
        counts[shuffle(rng, [0, 1, 2, 3]).indexOf(0)]++;
      }
      counts.forEach((count, position) =>
        expectWithinSigma(
          count / trials,
          0.25,
          binomialSe(0.25, trials),
          5,
          `position ${position}`,
        ),
      );
    });
  });

  describe('pick', () => {
    it('returns an element of the array', () => {
      fc.assert(
        fc.property(
          arbStream,
          fc.array(fc.string(), { minLength: 1, maxLength: 20 }),
          (rng, items) => {
            expect(items).toContain(pick(rng, items));
          },
        ),
      );
    });

    it('throws for an empty array', () => {
      expect(() => pick(createStream(seedKey, 'pick/empty'), [])).toThrow(RangeError);
    });
  });
});
