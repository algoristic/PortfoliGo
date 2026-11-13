import fc from 'fast-check';

import { indicatorSeries } from '@app/analysis/domain/indicator-logic';
import { IndicatorSpec } from '@app/analysis/domain/models/indicator.model';

import { candleTailChange, ChartIndicatorSeries, ChartIndicatorSet } from './chart-indicator-logic';
import { applyLiveCandle } from './chart-view-logic';
import { Candle } from './models/candle.model';
import { IndicatorLines } from './models/chart.model';

const STEP = 15;

function candle(tick: number, close: number): Candle {
  return { tick, open: close, high: close, low: close, close };
}

function candles(closes: number[], start = 0): Candle[] {
  return closes.map((close, index) => candle(start + index * STEP, close));
}

/** The lines a full computation over the closes gives (metamorphic reference). */
function fullLines(list: readonly Candle[], spec: IndicatorSpec): IndicatorLines {
  const points = indicatorSeries(
    list.map((item) => item.close),
    spec,
  );
  const lineCount = spec.kind === 'bollinger' ? 3 : 1;
  return Array.from({ length: lineCount }, (_, line) =>
    points.flatMap((point, index) =>
      point === null ? [] : [{ tick: list[index].tick, value: point[line] }],
    ),
  );
}

const arbSpec: fc.Arbitrary<IndicatorSpec> = fc.oneof(
  fc.record({
    kind: fc.constantFrom('sma' as const, 'ema' as const, 'smma' as const),
    period: fc.integer({ min: 2, max: 8 }),
  }),
  fc.record({
    kind: fc.constant('bollinger' as const),
    period: fc.integer({ min: 2, max: 8 }),
    multiplier: fc.constantFrom(1, 2, 2.5),
  }),
);
const arbClose = fc.double({ min: 0.01, max: 1e4, noNaN: true });

describe('chart-indicator-logic', () => {
  describe('candleTailChange', () => {
    const loaded = candles([1, 2, 3]);

    it('reports a changed newest candle', () => {
      const replaced = candle(2 * STEP, 4);
      expect(candleTailChange(loaded, [loaded[0], loaded[1], replaced])).toEqual({
        replaced,
        appended: null,
      });
    });

    it('reports a finished newest candle and a new one', () => {
      const finished = candle(2 * STEP, 5);
      const next = candle(3 * STEP, 6);
      expect(candleTailChange(loaded, [loaded[0], loaded[1], finished, next])).toEqual({
        replaced: finished,
        appended: next,
      });
      expect(candleTailChange(loaded, [...loaded, next])).toEqual({
        replaced: null,
        appended: next,
      });
    });

    it('reports no change for the same candles in a new array', () => {
      expect(candleTailChange(loaded, [...loaded])).toEqual({ replaced: null, appended: null });
    });

    it.each([
      ['no previous candles', [], loaded],
      ['a new data set', loaded, candles([1, 2, 3])],
      ['a changed older candle', loaded, [loaded[0], candle(STEP, 9), loaded[2]]],
      ['another newest tick', loaded, [loaded[0], loaded[1], candle(3 * STEP, 3)]],
      ['two new candles', loaded, [...loaded, candle(3 * STEP, 1), candle(4 * STEP, 1)]],
      ['fewer candles', loaded, loaded.slice(0, 2)],
      ['prepended candles', loaded, [candle(-STEP, 1), ...loaded]],
    ])('needs a full computation for %s', (_name, previous, next) => {
      expect(candleTailChange(previous, next)).toBeNull();
    });
  });

  describe('ChartIndicatorSeries', () => {
    it('continues live candles bit-identically to a full computation', () => {
      const arbOp = fc.oneof(
        fc.record({ op: fc.constant('replace' as const), close: arbClose }),
        fc.record({ op: fc.constant('append' as const), close: arbClose, finished: arbClose }),
        fc.record({ op: fc.constant('prepend' as const), closes: fc.array(arbClose) }),
        fc.record({ op: fc.constant('reset' as const), closes: fc.array(arbClose) }),
      );
      fc.assert(
        fc.property(
          arbSpec,
          fc.array(arbClose),
          fc.array(arbOp, { maxLength: 40 }),
          (spec, closes, ops) => {
            const series = new ChartIndicatorSeries(spec);
            let shown: readonly Candle[] = candles(closes);
            expect(series.update(shown)).toStrictEqual(fullLines(shown, spec));
            for (const step of ops) {
              const last = shown.at(-1);
              if (step.op === 'reset' || last === undefined) {
                shown = candles(step.op === 'reset' ? step.closes : [1]);
              } else if (step.op === 'replace') {
                shown = applyLiveCandle(
                  shown,
                  { candle: candle(last.tick, step.close) },
                  'replace',
                );
              } else if (step.op === 'append') {
                shown = applyLiveCandle(
                  shown,
                  {
                    candle: candle(last.tick + STEP, step.close),
                    previous: candle(last.tick, step.finished),
                  },
                  'append',
                );
              } else {
                const first = shown[0].tick;
                shown = [...candles(step.closes, first - step.closes.length * STEP), ...shown];
              }
              expect(series.update(shown)).toStrictEqual(fullLines(shown, spec));
            }
          },
        ),
      );
    });

    it('returns the same lines for the same candles and new lines after a change', () => {
      const series = new ChartIndicatorSeries({ kind: 'sma', period: 2 });
      const shown = candles([2, 4, 6]);
      const lines = series.update(shown);
      expect(series.update(shown)).toBe(lines);
      const next = applyLiveCandle(shown, { candle: candle(2 * STEP, 8) }, 'replace');
      const changed = series.update(next);
      expect(changed).not.toBe(lines);
      expect(changed[0].map((point) => point.value)).toEqual([3, 6]);
      expect(lines[0].map((point) => point.value)).toEqual([3, 5]);
      // Only the newest point is new; a new candle adds one.
      expect(changed[0][0]).toBe(lines[0][0]);
      const appended = series.update([...next, candle(3 * STEP, 10)]);
      expect(appended[0].slice(0, 2)).toEqual(changed[0]);
      expect(appended[0][0]).toBe(lines[0][0]);
      expect(appended[0][2]).toEqual({ tick: 3 * STEP, value: 9 });
    });
  });

  describe('ChartIndicatorSet', () => {
    it('keeps a series per id, restarts it for a new spec and drops removed ids', () => {
      const set = new ChartIndicatorSet();
      const shown = candles([2, 4, 6, 8]);
      const first = set.update(shown, [
        { id: 'a', spec: { kind: 'sma', period: 2 } },
        { id: 'b', spec: { kind: 'bollinger', period: 3, multiplier: 2 } },
      ]);
      expect([...first.keys()]).toEqual(['a', 'b']);
      expect(first.get('a')?.[0].map((point) => point.value)).toEqual([3, 5, 7]);
      expect(first.get('b')).toHaveLength(3);

      const second = set.update(shown, [
        { id: 'a', spec: { kind: 'sma', period: 3 } },
        { id: 'b', spec: { kind: 'bollinger', period: 3, multiplier: 2 } },
      ]);
      expect(second.get('a')?.[0].map((point) => point.value)).toEqual([4, 6]);
      expect(second.get('b')).toBe(first.get('b'));
      // The same moving average keeps its series, another kind with the same period starts again.
      const bollinger = { id: 'b', spec: { kind: 'bollinger', period: 3, multiplier: 2 } } as const;
      const sma = set.update(shown, [{ id: 'a', spec: { kind: 'sma', period: 3 } }, bollinger]);
      expect(sma.get('a')).toBe(second.get('a'));
      const ema = set.update(shown, [{ id: 'a', spec: { kind: 'ema', period: 3 } }, bollinger]);
      expect(ema.get('a')?.[0].map((point) => point.value)).toEqual([4, 6]);
      expect(ema.get('a')).not.toBe(second.get('a'));
      expect(ema.get('b')).toBe(first.get('b'));

      const third = set.update(shown, [
        { id: 'b', spec: { kind: 'bollinger', period: 3, multiplier: 1 } },
      ]);
      expect([...third.keys()]).toEqual(['b']);
      expect(third.get('b')).not.toBe(first.get('b'));
      expect(third.get('b')?.[1][0].value).toBeCloseTo(4 + Math.sqrt(8 / 3), 12);

      // A dropped id starts again when it comes back.
      const fourth = set.update(shown, [{ id: 'a', spec: { kind: 'ema', period: 3 } }]);
      expect(fourth.get('a')).not.toBe(ema.get('a'));
      expect(fourth.get('a')).toStrictEqual(ema.get('a'));
    });
  });
});
