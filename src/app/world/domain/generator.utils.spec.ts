import { createStream } from '@app/simulation/util/random-stream';
import { deriveSeedKey } from '@app/simulation/util/seed';

import { allocateByLargestRemainder, lognormalIn, roundToGrid } from './generator.utils';

describe('allocateByLargestRemainder', () => {
  it('splits the total exactly by weight', () => {
    expect(allocateByLargestRemainder(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(allocateByLargestRemainder(200, [0.4, 0.3, 0.18, 0.12])).toEqual([80, 60, 36, 24]);
    expect(allocateByLargestRemainder(5, [0, 1])).toEqual([0, 5]);
  });

  it('always sums to the total', () => {
    const counts = allocateByLargestRemainder(97, [0.31, 0.17, 0.05, 0.29, 0.18]);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(97);
  });
});

describe('roundToGrid', () => {
  it('rounds to the grid without binary artefacts', () => {
    expect(roundToGrid(0.10512, 2000)).toBe(0.105);
    expect(roundToGrid(0.0017499, 10_000)).toBe(0.0017);
  });
});

describe('lognormalIn', () => {
  it('stays inside the bounds', () => {
    const rng = createStream(deriveSeedKey('lognormal'), 'test');
    const spec = { median: 50, sigma: 2, min: 5, max: 500 };
    for (let i = 0; i < 2000; i++) {
      const value = lognormalIn(rng, spec);
      expect(value).toBeGreaterThanOrEqual(5);
      expect(value).toBeLessThanOrEqual(500);
    }
  });
});
