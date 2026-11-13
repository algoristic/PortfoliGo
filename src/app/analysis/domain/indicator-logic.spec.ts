import fc from 'fast-check';

import {
  BOLLINGER_MULTIPLIERS,
  createIndicatorTracker,
  DEFAULT_INDICATOR_SPECS,
  INDICATOR_PERIOD_MAX,
  INDICATOR_PERIOD_MIN,
  indicatorLineCount,
  indicatorSeries,
  isIndicatorSpec,
  smoothingFactor,
} from './indicator-logic';
import { INDICATOR_KINDS, IndicatorPoint, IndicatorSpec } from './models/indicator.model';

/** TS §11.7: the example series of the indicator table. */
const EXAMPLE = [2, 4, 6, 8, 7, 9];

const arbSpec = (maxPeriod = 12): fc.Arbitrary<IndicatorSpec> =>
  fc.oneof(
    fc.record({
      kind: fc.constantFrom('sma' as const, 'ema' as const, 'smma' as const),
      period: fc.integer({ min: INDICATOR_PERIOD_MIN, max: maxPeriod }),
    }),
    fc.record({
      kind: fc.constant('bollinger' as const),
      period: fc.integer({ min: INDICATOR_PERIOD_MIN, max: maxPeriod }),
      multiplier: fc.constantFrom(...BOLLINGER_MULTIPLIERS),
    }),
  );

const arbPrices = (maxLength = 60): fc.Arbitrary<number[]> =>
  fc.array(fc.double({ min: 0.01, max: 1e5, noNaN: true }), { maxLength });

/** Independent reference: every point from its own window, EMA/SMMA as `prev + α · (x − prev)`. */
function bruteForce(values: number[], spec: IndicatorSpec): (number[] | null)[] {
  const n = spec.period;
  const result: (number[] | null)[] = [];
  let average = Number.NaN;
  for (let i = 0; i < values.length; i++) {
    if (i < n - 1) {
      result.push(null);
      continue;
    }
    const window = values.slice(i - n + 1, i + 1);
    const sma = window.reduce((sum, value) => sum + value, 0) / n;
    if (spec.kind === 'sma') {
      result.push([sma]);
    } else if (spec.kind === 'bollinger') {
      const sigma = Math.sqrt(window.reduce((sum, value) => sum + (value - sma) ** 2, 0) / n);
      result.push([sma, sma + spec.multiplier * sigma, sma - spec.multiplier * sigma]);
    } else {
      const alpha = spec.kind === 'ema' ? 2 / (n + 1) : 1 / n;
      average = i === n - 1 ? sma : average + alpha * (values[i] - average);
      result.push([average]);
    }
  }
  return result;
}

function expectClosePoints(
  actual: readonly (IndicatorPoint | null)[],
  expected: readonly (readonly number[] | null)[],
  tolerance = 1e-9,
): void {
  expect(actual.length).toBe(expected.length);
  actual.forEach((point, index) => {
    const reference = expected[index];
    if (reference === null || point === null) {
      expect(point).toBe(reference);
      return;
    }
    expect(point.length).toBe(reference.length);
    point.forEach((value, line) => {
      const scale = Math.max(1, Math.abs(reference[line]));
      expect(Math.abs(value - reference[line])).toBeLessThanOrEqual(tolerance * scale);
    });
  });
}

describe('indicator-logic', () => {
  describe('indicatorSeries', () => {
    // TS §11.7: example table for the series 2, 4, 6, 8, 7, 9 with n = 3 and k = 2.
    it.each<[IndicatorSpec, (number[] | null)[]]>([
      [{ kind: 'sma', period: 3 }, [null, null, [4], [6], [7], [8]]],
      [{ kind: 'ema', period: 3 }, [null, null, [4], [6], [6.5], [7.75]]],
      [{ kind: 'smma', period: 3 }, [null, null, [4], [16 / 3], [53 / 9], [187 / 27]]],
      [
        { kind: 'bollinger', period: 3, multiplier: 2 },
        [
          null,
          null,
          [4, 4 + 2 * Math.sqrt(8 / 3), 4 - 2 * Math.sqrt(8 / 3)],
          [6, 6 + 2 * Math.sqrt(8 / 3), 6 - 2 * Math.sqrt(8 / 3)],
          [7, 7 + 2 * Math.sqrt(2 / 3), 7 - 2 * Math.sqrt(2 / 3)],
          [8, 8 + 2 * Math.sqrt(2 / 3), 8 - 2 * Math.sqrt(2 / 3)],
        ],
      ],
    ])('computes %o for the example series', (spec, expected) => {
      expectClosePoints(indicatorSeries(EXAMPLE, spec), expected, 1e-12);
    });

    it('matches the brute-force reference', () => {
      fc.assert(
        fc.property(arbPrices(), arbSpec(), (values, spec) => {
          expectClosePoints(indicatorSeries(values, spec), bruteForce(values, spec));
        }),
      );
    });

    it('starts at the value of the period', () => {
      fc.assert(
        fc.property(arbPrices(), arbSpec(), (values, spec) => {
          const series = indicatorSeries(values, spec);
          const first = series.findIndex((point) => point !== null);
          expect(first).toBe(values.length >= spec.period ? spec.period - 1 : -1);
          if (first >= 0) {
            expect(series.slice(first).every((point) => point !== null)).toBe(true);
          }
          expect(
            series.every((point) => point === null || point.length === indicatorLineCount(spec)),
          ).toBe(true);
        }),
      );
    });

    it('gives the constant of a constant series', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 1e5, noNaN: true }),
          fc.integer({ min: 0, max: 30 }),
          arbSpec(),
          (value, extra, spec) => {
            const series = indicatorSeries(Array(spec.period + extra).fill(value), spec);
            for (const point of series.slice(spec.period - 1)) {
              expect(point?.[0]).toBeCloseTo(value, 6);
            }
          },
        ),
      );
    });

    it('keeps the Bollinger middle on the SMA and the bands symmetric around it', () => {
      fc.assert(
        fc.property(
          arbPrices(),
          fc.integer({ min: INDICATOR_PERIOD_MIN, max: 12 }),
          fc.constantFrom(...BOLLINGER_MULTIPLIERS),
          (values, period, multiplier) => {
            const bands = indicatorSeries(values, { kind: 'bollinger', period, multiplier });
            const sma = indicatorSeries(values, { kind: 'sma', period });
            bands.forEach((point, index) => {
              if (point === null) {
                expect(sma[index]).toBeNull();
                return;
              }
              const [middle, upper, lower] = point;
              expect(middle).toBe(sma[index]?.[0]);
              expect(upper).toBeGreaterThanOrEqual(middle);
              expect(lower).toBeLessThanOrEqual(middle);
              expect(Math.abs(upper - middle - (middle - lower))).toBeLessThanOrEqual(
                1e-9 * Math.max(1, middle),
              );
            });
          },
        ),
      );
    });

    it('keeps EMA and SMMA between the lowest and highest value so far', () => {
      fc.assert(
        fc.property(
          arbPrices(),
          fc.integer({ min: INDICATOR_PERIOD_MIN, max: 12 }),
          fc.constantFrom('ema' as const, 'smma' as const),
          (values, period, kind) => {
            indicatorSeries(values, { kind, period }).forEach((point, index) => {
              if (point !== null) {
                const seen = values.slice(0, index + 1);
                const slack = 1e-9 * Math.max(...seen);
                expect(point[0]).toBeGreaterThanOrEqual(Math.min(...seen) - slack);
                expect(point[0]).toBeLessThanOrEqual(Math.max(...seen) + slack);
              }
            });
          },
        ),
      );
    });
  });

  describe('createIndicatorTracker', () => {
    it('continues bit-identically to the full series with new and changed newest values', () => {
      const arbStep = fc.record({
        replace: fc.boolean(),
        value: fc.double({ min: 0.01, max: 1e5, noNaN: true }),
      });
      fc.assert(
        fc.property(arbSpec(), fc.array(arbStep, { maxLength: 80 }), (spec, steps) => {
          const tracker = createIndicatorTracker(spec);
          const values: number[] = [];
          for (const { replace, value } of steps) {
            let point: IndicatorPoint | null;
            if (replace && values.length > 0) {
              values[values.length - 1] = value;
              point = tracker.replaceLast(value);
            } else {
              values.push(value);
              point = tracker.push(value);
            }
            expect(tracker.count).toBe(values.length);
            expect(point).toStrictEqual(indicatorSeries(values, spec).at(-1));
          }
        }),
      );
    });

    it('treats replaceLast without values as the first value', () => {
      for (const kind of INDICATOR_KINDS) {
        const tracker = createIndicatorTracker({ ...DEFAULT_INDICATOR_SPECS[kind], period: 2 });
        expect(tracker.replaceLast(5)).toBeNull();
        expect(tracker.count).toBe(1);
        expect(tracker.push(7)?.[0]).toBe(6);
      }
    });
  });

  describe('smoothingFactor', () => {
    it.each([
      ['ema', 3, 0.5],
      ['ema', 19, 0.1],
      ['smma', 4, 0.25],
    ] as const)('gives α for %s(%d) = %d', (kind, period, alpha) => {
      expect(smoothingFactor(kind, period)).toBe(alpha);
    });
  });

  describe('isIndicatorSpec', () => {
    it.each([
      { kind: 'sma', period: 2 },
      { kind: 'ema', period: 200 },
      { kind: 'smma', period: 14 },
      { kind: 'bollinger', period: 20, multiplier: 0.5 },
      { kind: 'bollinger', period: 20, multiplier: 4 },
    ])('accepts %o', (value) => {
      expect(isIndicatorSpec(value)).toBe(true);
    });

    it.each([
      null,
      'sma',
      {},
      { kind: 'sma' },
      { period: 20 },
      { kind: 'wma', period: 20 },
      { kind: 'sma', period: 1 },
      { kind: 'sma', period: 201 },
      { kind: 'sma', period: 20.5 },
      { kind: 'sma', period: '20' },
      { kind: 'sma', period: 20, multiplier: 2 },
      { kind: 'bollinger', period: 20 },
      { kind: 'bollinger', period: 20, multiplier: 0 },
      { kind: 'bollinger', period: 20, multiplier: 2.25 },
      { kind: 'bollinger', period: 20, multiplier: 4.5 },
    ])('rejects %o', (value) => {
      expect(isIndicatorSpec(value)).toBe(false);
    });

    it('accepts the defaults', () => {
      for (const kind of INDICATOR_KINDS) {
        expect(isIndicatorSpec(DEFAULT_INDICATOR_SPECS[kind])).toBe(true);
      }
      expect(INDICATOR_PERIOD_MAX).toBe(200);
    });
  });
});
