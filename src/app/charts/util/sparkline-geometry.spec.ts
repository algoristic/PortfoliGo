import fc from 'fast-check';

import { sparklineGeometry } from './sparkline-geometry';

// Worked examples on a 100 × 22 view box with an inset of 1: the drawable height is 20, so a value
// at the top of the range lies at y = 1 and one at the bottom at y = 21.

describe('sparklineGeometry', () => {
  it('spreads the values over the width and the range over the height', () => {
    expect(sparklineGeometry([10, 20, 15], null, 100, 22)).toEqual({
      path: 'M0 21 L50 1 L100 11',
      referenceY: null,
      direction: 'up',
    });
  });

  it('includes the reference in the range and compares the last value with it', () => {
    // Range 10…30: 20 is in the middle (y = 11), 10 at the bottom, the reference 30 at the top.
    expect(sparklineGeometry([20, 10], 30, 100, 22)).toEqual({
      path: 'M0 11 L100 21',
      referenceY: 1,
      direction: 'down',
    });
  });

  it('rounds coordinates to two decimal places', () => {
    // x = 100 / 3 = 33.333…; y of 1 in 0…3: 1 + 2/3 · 20 = 14.333…
    expect(sparklineGeometry([0, 1, 2, 3], null, 100, 22).path).toBe(
      'M0 21 L33.33 14.33 L66.67 7.67 L100 1',
    );
  });

  it('draws equal values and a single value as a horizontal line in the middle', () => {
    expect(sparklineGeometry([5, 5], 5, 100, 22)).toEqual({
      path: 'M0 11 L100 11',
      referenceY: 11,
      direction: 'flat',
    });
    expect(sparklineGeometry([7], null, 40, 10).path).toBe('M0 5 L40 5');
  });

  it('skips non-finite values and returns nothing without values', () => {
    expect(sparklineGeometry([Number.NaN, 1, Infinity, 2], Number.NaN, 10, 12)).toEqual({
      path: 'M0 11 L10 1',
      referenceY: null,
      direction: 'up',
    });
    expect(sparklineGeometry([], 3, 10, 10)).toEqual({
      path: '',
      referenceY: null,
      direction: 'flat',
    });
  });

  it('keeps every point inside the view box minus the inset', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -1e6, max: 1e6, noNaN: true }), { minLength: 1, maxLength: 50 }),
        fc.option(fc.double({ min: -1e6, max: 1e6, noNaN: true })),
        (values, reference) => {
          const { path, referenceY } = sparklineGeometry(values, reference, 120, 30, 2);
          const numbers = path.replace(/[ML]/g, '').trim().split(/\s+/).map(Number);
          for (let index = 0; index < numbers.length; index += 2) {
            expect(numbers[index]).toBeGreaterThanOrEqual(0);
            expect(numbers[index]).toBeLessThanOrEqual(120);
            expect(numbers[index + 1]).toBeGreaterThanOrEqual(2);
            expect(numbers[index + 1]).toBeLessThanOrEqual(28);
          }
          if (referenceY !== null) {
            expect(referenceY).toBeGreaterThanOrEqual(2);
            expect(referenceY).toBeLessThanOrEqual(28);
          }
        },
      ),
    );
  });
});
