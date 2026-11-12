import fc from 'fast-check';

import { createStream } from '@app/simulation/util/random-stream';
import { deriveSeedKey } from '@app/simulation/util/seed';

import { allocateByLargestRemainder, lognormalIn, roundToGrid } from './generator.utils';

describe('allocateByLargestRemainder', () => {
  it('splits the total exactly by weight', () => {
    expect(allocateByLargestRemainder(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(allocateByLargestRemainder(200, [0.4, 0.3, 0.18, 0.12])).toEqual([80, 60, 36, 24]);
    expect(allocateByLargestRemainder(5, [0, 1])).toEqual([0, 5]);
  });

  it('sums to the total and stays within one of the exact share', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10_000 }),
        fc
          .array(fc.double({ min: 0, max: 100, noNaN: true }), { minLength: 1, maxLength: 12 })
          .filter((weights) => weights.some((weight) => weight > 0)),
        (total, weights) => {
          const counts = allocateByLargestRemainder(total, weights);
          const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
          expect(counts.reduce((sum, count) => sum + count, 0)).toBe(total);
          counts.forEach((count, i) => {
            expect(Number.isInteger(count)).toBe(true);
            expect(Math.abs(count - (total * weights[i]) / weightSum)).toBeLessThan(1);
            if (weights[i] === 0) {
              expect(count).toBe(0);
            }
          });
        },
      ),
    );
  });
});

describe('roundToGrid', () => {
  it('rounds to the grid without binary artefacts', () => {
    expect(roundToGrid(0.10512, 2000)).toBe(0.105);
    expect(roundToGrid(0.0017499, 10_000)).toBe(0.0017);
  });

  it('moves a value by at most half a grid step', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1, max: 1, noNaN: true }),
        fc.constantFrom(100, 2000, 10_000),
        (value, stepsPerUnit) => {
          const rounded = roundToGrid(value, stepsPerUnit);
          expect(Math.abs(rounded - value)).toBeLessThanOrEqual(0.5 / stepsPerUnit + 1e-12);
          expect(roundToGrid(rounded, stepsPerUnit)).toBe(rounded);
        },
      ),
    );
  });
});

describe('lognormalIn', () => {
  it('stays inside the bounds of any spec', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.double({ min: 0.1, max: 3, noNaN: true }),
        fc.double({ min: 1, max: 100, noNaN: true }),
        fc.double({ min: 1.01, max: 100, noNaN: true }),
        (key, sigma, median, spread) => {
          const rng = createStream(deriveSeedKey('lognormal'), key);
          const spec = { median, sigma, min: median / spread, max: median * spread };
          for (let i = 0; i < 50; i++) {
            const value = lognormalIn(rng, spec);
            expect(value).toBeGreaterThanOrEqual(spec.min);
            expect(value).toBeLessThanOrEqual(spec.max);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
