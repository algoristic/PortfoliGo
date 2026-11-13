import fc from 'fast-check';

import { donutStrokes } from './donut-geometry';

// A radius of 50 / π gives a circumference of exactly 100, so dash lengths read as percentages.
const RADIUS = 50 / Math.PI;

describe('donutStrokes', () => {
  it('draws each share as an arc that starts where the previous one ends', () => {
    expect(
      donutStrokes(
        [
          { id: 'a', value: 1 },
          { id: 'b', value: 1 },
          { id: 'c', value: 2 },
        ],
        RADIUS,
      ),
    ).toEqual([
      { id: 'a', fraction: 0.25, dashArray: '25 100', dashOffset: 0 },
      { id: 'b', fraction: 0.25, dashArray: '25 100', dashOffset: -25 },
      { id: 'c', fraction: 0.5, dashArray: '50 100', dashOffset: -50 },
    ]);
  });

  it('draws a single part as the full circle', () => {
    expect(donutStrokes([{ id: 'all', value: 3 }], RADIUS)).toEqual([
      { id: 'all', fraction: 1, dashArray: '100 100', dashOffset: 0 },
    ]);
  });

  it('rounds lengths to three decimal places', () => {
    // Circumference 2π ≈ 6.2832; a third ≈ 2.0944.
    expect(
      donutStrokes(
        [
          { id: 'a', value: 1 },
          { id: 'b', value: 2 },
        ],
        1,
      ).map((stroke) => [stroke.dashArray, stroke.dashOffset]),
    ).toEqual([
      ['2.094 6.283', 0],
      ['4.189 6.283', -2.094],
    ]);
  });

  it('skips parts that are not positive or not finite', () => {
    expect(
      donutStrokes(
        [
          { id: 'zero', value: 0 },
          { id: 'negative', value: -1 },
          { id: 'nan', value: Number.NaN },
          { id: 'a', value: 4 },
        ],
        RADIUS,
      ).map((stroke) => stroke.id),
    ).toEqual(['a']);
    expect(donutStrokes([], RADIUS)).toEqual([]);
  });

  it('splits the whole circle into the shares of the values', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0.001, max: 1e6, noNaN: true }), { minLength: 1, maxLength: 12 }),
        (values) => {
          const total = values.reduce((sum, value) => sum + value, 0);
          const strokes = donutStrokes(
            values.map((value, index) => ({ id: String(index), value })),
            RADIUS,
          );
          strokes.forEach((stroke, index) => {
            expect(stroke.fraction).toBeCloseTo(values[index] / total, 9);
          });
          const last = strokes[strokes.length - 1];
          const end = -last.dashOffset + Number(last.dashArray.split(' ')[0]);
          expect(end).toBeCloseTo(100, 2);
        },
      ),
    );
  });
});
