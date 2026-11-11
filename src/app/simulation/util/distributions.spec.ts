import { detExp } from './det-math';
import {
  lognormal,
  normal,
  pick,
  poisson,
  shuffle,
  uniform,
  uniformInt,
  weightedIndex,
} from './distributions';
import { createStream } from './random-stream';
import { deriveSeedKey } from './seed';

interface Moments {
  mean: number;
  variance: number;
  skewness: number;
  excessKurtosis: number;
}

function moments(values: number[]): Moments {
  const n = values.length;
  const mean = values.reduce((sum, x) => sum + x, 0) / n;
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const x of values) {
    const d = x - mean;
    m2 += d * d;
    m3 += d * d * d;
    m4 += d * d * d * d;
  }
  m2 /= n;
  m3 /= n;
  m4 /= n;
  return {
    mean,
    variance: m2,
    skewness: m3 / m2 ** 1.5,
    excessKurtosis: m4 / (m2 * m2) - 3,
  };
}

describe('distributions', () => {
  const seedKey = deriveSeedKey('distributions');
  const n = 100_000;

  function draw(key: string, sample: (rng: ReturnType<typeof createStream>) => number): number[] {
    const rng = createStream(seedKey, key);
    return Array.from({ length: n }, () => sample(rng));
  }

  describe('uniform', () => {
    it('draws from [min, max) with the expected moments', () => {
      const values = draw('uniform', (rng) => uniform(rng, -2, 6));
      expect(Math.min(...values)).toBeGreaterThanOrEqual(-2);
      expect(Math.max(...values)).toBeLessThan(6);
      const { mean, variance } = moments(values);
      expect(mean).toBeCloseTo(2, 1);
      expect(Math.abs(variance - 64 / 12)).toBeLessThan(0.05);
    });
  });

  describe('uniformInt', () => {
    it('covers both bounds with equal frequencies', () => {
      const counts = new Array<number>(6).fill(0);
      const rng = createStream(seedKey, 'uniform-int');
      for (let i = 0; i < 60_000; i++) {
        counts[uniformInt(rng, 1, 6) - 1]++;
      }
      for (const count of counts) {
        expect(Math.abs(count - 10_000)).toBeLessThan(400);
      }
    });

    it('returns min for a single-value range and supports 2^32 values', () => {
      const rng = createStream(seedKey, 'uniform-int/edges');
      expect(uniformInt(rng, 5, 5)).toBe(5);
      const value = uniformInt(rng, 0, 4294967295);
      expect(value >= 0 && value <= 4294967295).toBe(true);
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
      const { mean, variance, skewness, excessKurtosis } = moments(draw('normal', normal));
      expect(Math.abs(mean)).toBeLessThan(0.015);
      expect(Math.abs(variance - 1)).toBeLessThan(0.02);
      expect(Math.abs(skewness)).toBeLessThan(0.04);
      expect(Math.abs(excessKurtosis)).toBeLessThan(0.08);
    });

    it('applies mean and standard deviation', () => {
      const { mean, variance } = moments(draw('normal/scaled', (rng) => normal(rng, 10, 3)));
      expect(Math.abs(mean - 10)).toBeLessThan(0.05);
      expect(Math.abs(variance - 9)).toBeLessThan(0.2);
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
      const { mean } = moments(draw('lognormal', (rng) => lognormal(rng, 0.1, 0.25)));
      expect(Math.abs(mean - Math.exp(0.1 + 0.25 ** 2 / 2))).toBeLessThan(0.005);
    });

    it('returns positive values only', () => {
      const values = draw('lognormal/positive', (rng) => lognormal(rng, 0, 2));
      expect(values.every((value) => value > 0)).toBe(true);
    });
  });

  describe('poisson', () => {
    it('has mean and variance lambda', () => {
      for (const lambda of [0.2, 3, 30]) {
        const values = draw(`poisson/${lambda}`, (rng) => poisson(rng, lambda));
        expect(values.every((value) => Number.isInteger(value) && value >= 0)).toBe(true);
        const { mean, variance } = moments(values);
        expect(Math.abs(mean - lambda) / lambda).toBeLessThan(0.02);
        expect(Math.abs(variance - lambda) / lambda).toBeLessThan(0.04);
      }
    });

    it('returns 0 for lambda 0', () => {
      const rng = createStream(seedKey, 'poisson/zero');
      expect(poisson(rng, 0)).toBe(0);
    });

    it('draws the same values with a precomputed exp(-lambda)', () => {
      const lambda = 0.0153;
      const plain = draw('poisson/precomputed', (rng) => poisson(rng, lambda));
      const precomputed = draw('poisson/precomputed', (rng) =>
        poisson(rng, lambda, detExp(-lambda)),
      );
      expect(precomputed).toEqual(plain);
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
      expect(Math.abs(counts[0] / n - 0.1)).toBeLessThan(0.005);
      expect(Math.abs(counts[2] / n - 0.3)).toBeLessThan(0.005);
      expect(Math.abs(counts[3] / n - 0.6)).toBeLessThan(0.005);
    });

    it('never returns a trailing zero weight', () => {
      const rng = createStream(seedKey, 'weighted/trailing');
      for (let i = 0; i < 1000; i++) {
        expect(weightedIndex(rng, [2, 1, 0])).toBeLessThan(2);
      }
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
    it('returns a reproducible permutation in place', () => {
      const items = Array.from({ length: 50 }, (_, i) => i);
      const shuffled = shuffle(createStream(seedKey, 'shuffle'), items);
      expect(shuffled).toBe(items);
      expect([...shuffled].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i));
      expect(shuffled).not.toEqual(Array.from({ length: 50 }, (_, i) => i));
      const again = shuffle(
        createStream(seedKey, 'shuffle'),
        Array.from({ length: 50 }, (_, i) => i),
      );
      expect(again).toEqual(shuffled);
    });

    it('places every item at every position with equal frequency', () => {
      const rng = createStream(seedKey, 'shuffle/uniform');
      const counts = [0, 0, 0, 0];
      for (let i = 0; i < 40_000; i++) {
        counts[shuffle(rng, [0, 1, 2, 3]).indexOf(0)]++;
      }
      for (const count of counts) {
        expect(Math.abs(count - 10_000)).toBeLessThan(400);
      }
    });
  });

  describe('pick', () => {
    it('returns an element of the array', () => {
      const rng = createStream(seedKey, 'pick');
      const items = ['a', 'b', 'c'] as const;
      for (let i = 0; i < 100; i++) {
        expect(items).toContain(pick(rng, items));
      }
    });

    it('throws for an empty array', () => {
      expect(() => pick(createStream(seedKey, 'pick/empty'), [])).toThrow(RangeError);
    });
  });
});
