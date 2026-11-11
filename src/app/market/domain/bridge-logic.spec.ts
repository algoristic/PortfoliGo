import {
  createBridgeTable,
  createUniformBridgeTable,
  fillBridge,
  profileWeights,
} from './bridge-logic';

import { createStream } from '../../simulation/util/random-stream';
import { deriveSeedKey } from '../../simulation/util/seed';

const seedKey = deriveSeedKey('bridge-test');

/** Variance of the increments per minute over many bridges from 0 to 0 with total variance 1. */
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

    it('is reproducible from the stream', () => {
      const table = createUniformBridgeTable(30);
      const first = new Float64Array(31);
      const second = new Float64Array(31);
      fillBridge(first, 0, 0, 1, table, 0.2, createStream(seedKey, 'c'));
      fillBridge(second, 0, 0, 1, table, 0.2, createStream(seedKey, 'c'));
      expect(second).toEqual(first);
    });

    it('spreads the variance evenly with a uniform table', () => {
      // Bridge from 0 to 0: increment variance per minute is (1/n)·(1 − 1/n).
      const variances = incrementVariances(new Array<number>(10).fill(1), 4000);
      variances.forEach((variance) => expect(variance).toBeCloseTo(0.09, 1));
    });

    it('follows the variance weights of a profile', () => {
      const variances = incrementVariances([3, 1, 1, 3], 8000);
      expect(variances[0] / variances[1]).toBeGreaterThan(2);
      expect(variances[3] / variances[2]).toBeGreaterThan(2);
    });
  });

  describe('createBridgeTable', () => {
    it('rejects empty bridges and non-positive weights', () => {
      expect(() => createBridgeTable([])).toThrow(RangeError);
      expect(() => createBridgeTable([1, 0])).toThrow(RangeError);
    });

    it('gives the same table for scaled weights', () => {
      expect(createBridgeTable([2, 2, 2]).ratio).toEqual(createUniformBridgeTable(3).ratio);
    });
  });

  describe('profileWeights', () => {
    it('maps the minutes to equally long parts of the session', () => {
      expect([...profileWeights([2, 1], 4)]).toEqual([2, 2, 1, 1]);
      expect([...profileWeights([1], 3)]).toEqual([1, 1, 1]);
      expect([...profileWeights([3, 1, 2], 7)]).toEqual([3, 3, 3, 1, 1, 2, 2]);
    });
  });
});
