import fc from 'fast-check';

import { heatLevel } from './heatmap-logic';

describe('heatLevel', () => {
  // TS §11.3, table "Stufen der Sektor-Heatmap": bounds 0.05 %, 0.5 %, 1 % and 2 %, inclusive.
  it.each([
    [0, 0],
    [0.000_49, 0],
    [-0.000_49, 0],
    [0.000_5, 1],
    [-0.000_5, -1],
    [0.004_9, 1],
    [0.005, 2],
    [-0.009_9, -2],
    [0.01, 3],
    [-0.019_9, -3],
    [0.02, 4],
    [-0.02, -4],
    [0.15, 4],
    [-0.5, -4],
  ])('puts a change of %d on level %d', (changeRatio, expected) => {
    expect(heatLevel(changeRatio)).toBe(expected);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'puts %d on level 0',
    (changeRatio) => {
      expect(heatLevel(changeRatio)).toBe(0);
    },
  );

  it('never returns negative zero', () => {
    expect(Object.is(heatLevel(-0.0001), 0)).toBe(true);
  });

  it('is symmetric and grows with the size of the change', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (a, b) => {
          const [small, large] = a <= b ? [a, b] : [b, a];
          expect(heatLevel(-large)).toBe(heatLevel(large) === 0 ? 0 : -heatLevel(large));
          expect(heatLevel(small)).toBeLessThanOrEqual(heatLevel(large));
        },
      ),
    );
  });
});
