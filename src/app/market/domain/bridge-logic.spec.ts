import fc from 'fast-check';

import { createStream } from '@app/simulation/util/random-stream';
import { deriveSeedKey } from '@app/simulation/util/seed';

import {
  createBridgeTable,
  createUniformBridgeTable,
  fillBridge,
  profileWeights,
} from './bridge-logic';

import { expectWithinSigma, varianceSe } from '../../../testing/statistics';

const seedKey = deriveSeedKey('bridge-test');

/** Mean squared increment per minute over many bridges from 0 to 0 with total variance 1. */
function incrementVariances(weights: number[], runs: number): number[] {
  const table = createBridgeTable(weights);
  const out = new Float64Array(weights.length + 1);
  const sums = new Array<number>(weights.length).fill(0);
  for (let run = 0; run < runs; run++) {
    fillBridge(out, 0, 0, 0, table, 1, createStream(seedKey, `bridge/${run}`));
    for (let j = 0; j < weights.length; j++) {
      sums[j] += (out[j + 1] - out[j]) ** 2;
    }
  }
  return sums.map((sum) => sum / runs);
}

/**
 * Conditional variance of increment j of a Brownian motion with increment variances `v_j`
 * (normalized to a sum of 1) given that the increments sum to 0: `v_j · (1 − v_j)`.
 */
function bridgeIncrementVariances(weights: number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => (weight / total) * (1 - weight / total));
}

const arbWeights = fc.array(fc.double({ min: 0.01, max: 100, noNaN: true }), {
  minLength: 1,
  maxLength: 60,
});

describe('bridge logic', () => {
  describe('fillBridge', () => {
    it('hits both support points exactly', () => {
      const out = new Float64Array(12);
      const start = 0.1 + 0.2;
      const end = -1 / 3;
      fillBridge(out, 2, start, end, createUniformBridgeTable(9), 0.5, createStream(seedKey, 'a'));
      expect(out[2]).toBe(start);
      expect(out[11]).toBe(end);
      expect(out[0]).toBe(0);
    });

    it('sets only the end point for a bridge over one minute', () => {
      const out = new Float64Array(2);
      fillBridge(out, 0, 1, 2, createUniformBridgeTable(1), 1, createStream(seedKey, 'b'));
      expect([...out]).toEqual([1, 2]);
    });

    it('writes exactly its range and hits both ends for any bridge (TS §4.5, rule 8)', () => {
      fc.assert(
        fc.property(
          arbWeights,
          fc.nat({ max: 5 }),
          fc.double({ min: -10, max: 10, noNaN: true }),
          fc.double({ min: -10, max: 10, noNaN: true }),
          fc.double({ min: 0, max: 2, noNaN: true }),
          fc.string(),
          (weights, offset, start, end, scale, key) => {
            const out = new Float64Array(offset + weights.length + 3).fill(Number.NaN);
            fillBridge(
              out,
              offset,
              start,
              end,
              createBridgeTable(weights),
              scale,
              createStream(seedKey, key),
            );
            expect(out[offset]).toBe(start);
            expect(out[offset + weights.length]).toBe(end);
            for (let j = 0; j < out.length; j++) {
              const inside = j >= offset && j <= offset + weights.length;
              expect(Number.isNaN(out[j])).toBe(!inside);
            }
          },
        ),
      );
    });

    it('writes up to minute `last` the same values as the whole bridge and nothing after', () => {
      fc.assert(
        fc.property(
          arbWeights,
          fc.double({ min: 0, max: 1, noNaN: true }),
          fc.double({ min: 0, max: 2, noNaN: true }),
          fc.string(),
          (weights, share, scale, key) => {
            const table = createBridgeTable(weights);
            const last = Math.round(share * weights.length);
            const whole = new Float64Array(weights.length + 1);
            const prefix = new Float64Array(weights.length + 1).fill(Number.NaN);
            fillBridge(whole, 0, 0.5, -0.25, table, scale, createStream(seedKey, key));
            fillBridge(prefix, 0, 0.5, -0.25, table, scale, createStream(seedKey, key), last);
            expect([...prefix.subarray(0, last + 1)]).toEqual([...whole.subarray(0, last + 1)]);
            expect(prefix.subarray(last + 1).every(Number.isNaN)).toBe(true);
          },
        ),
      );
    });

    it('is reproducible from the stream', () => {
      const table = createUniformBridgeTable(30);
      const first = new Float64Array(31);
      const second = new Float64Array(31);
      fillBridge(first, 0, 0, 1, table, 0.2, createStream(seedKey, 'c'));
      fillBridge(second, 0, 0, 1, table, 0.2, createStream(seedKey, 'c'));
      expect(second).toEqual(first);
    });

    it.each([
      { name: 'evenly with a uniform table', weights: new Array<number>(10).fill(1), runs: 4000 },
      { name: 'by the weights of a profile', weights: [3, 1, 1, 3], runs: 8000 },
    ])('spreads the variance $name', ({ weights, runs }) => {
      const observed = incrementVariances(weights, runs);
      bridgeIncrementVariances(weights).forEach((expected, j) =>
        expectWithinSigma(observed[j], expected, varianceSe(expected, runs), 5, `minute ${j}`),
      );
    });
  });

  describe('createBridgeTable', () => {
    it('rejects empty bridges and non-positive weights', () => {
      expect(() => createBridgeTable([])).toThrow(RangeError);
      expect(() => createBridgeTable([1, 0])).toThrow(RangeError);
    });

    it('gives the same table for scaled weights', () => {
      expect(createBridgeTable([2, 2, 2]).ratio).toEqual(createUniformBridgeTable(3).ratio);
      fc.assert(
        fc.property(arbWeights, fc.constantFrom(0.25, 0.5, 2, 8), (weights, factor) => {
          const table = createBridgeTable(weights);
          const scaled = createBridgeTable(weights.map((weight) => weight * factor));
          expect(scaled.ratio).toEqual(table.ratio);
          expect(scaled.noise).toEqual(table.noise);
        }),
      );
    });
  });

  describe('profileWeights', () => {
    it('maps the minutes to equally long parts of the session', () => {
      expect([...profileWeights([2, 1], 4)]).toEqual([2, 2, 1, 1]);
      expect([...profileWeights([1], 3)]).toEqual([1, 1, 1]);
      expect([...profileWeights([3, 1, 2], 7)]).toEqual([3, 3, 3, 1, 1, 2, 2]);
    });

    it('covers the parts in order with lengths that differ by at most one minute', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 12 }),
          fc.integer({ min: 0, max: 600 }),
          (parts, extra) => {
            const length = parts + extra;
            // Part numbers as weights, so the weights show which part a minute belongs to.
            const weights = profileWeights(
              Array.from({ length: parts }, (_value, n) => n),
              length,
            );
            const counts = new Array<number>(parts).fill(0);
            weights.forEach((part, j) => {
              counts[part]++;
              if (j > 0) {
                expect(part).toBeGreaterThanOrEqual(weights[j - 1]);
              }
            });
            expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
          },
        ),
      );
    });
  });
});
