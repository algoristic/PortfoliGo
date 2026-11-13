import fc from 'fast-check';

import { dateTimeToTick, GAME_START_TICK } from '@app/clock/domain/calendar-logic';
import { TICKS_PER_DAY } from '@app/clock/domain/models/time.model';
import { Candle } from '@app/market/domain/models/candle.model';

import {
  candleAt,
  chartTimeToTick,
  formatChartTime,
  formatTickMark,
  HISTORY_THRESHOLD_BARS,
  incrementalUpdates,
  isPrepended,
  readChartColors,
  shouldRequestHistory,
  tickToChartTime,
  toChartCandles,
  toLinePoints,
} from './price-chart.utils';

import { arbTick } from '../../../../testing/arbitraries';

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;

describe('price chart utils', () => {
  describe('tickToChartTime', () => {
    it('maps the game start to 01.04.2030 00:00 UTC', () => {
      expect(tickToChartTime(GAME_START_TICK) * MS_PER_SECOND).toBe(Date.UTC(2030, 3, 1));
    });

    it('matches the game calendar across leap days and years', () => {
      for (const dateTime of [
        { year: 2020, month: 2, day: 29, hour: 17, minute: 35 },
        { year: 2024, month: 12, day: 31, hour: 23, minute: 59 },
        { year: 2031, month: 3, day: 1, hour: 9, minute: 0 },
      ]) {
        const { year, month, day, hour, minute } = dateTime;
        expect(tickToChartTime(dateTimeToTick(dateTime)) * MS_PER_SECOND).toBe(
          Date.UTC(year, month - 1, day, hour, minute),
        );
      }
    });

    it('maps every tick to one minute after 01.01.2020 00:00 UTC per tick', () => {
      // Oracle: a tick is a game minute since the epoch (TS §3.2), and the chart time is UTC.
      fc.assert(
        fc.property(arbTick(), (tick) => {
          expect(tickToChartTime(tick) * MS_PER_SECOND).toBe(
            Date.UTC(2020, 0, 1) + tick * MS_PER_MINUTE,
          );
        }),
      );
    });

    it('round-trips with chartTimeToTick', () => {
      fc.assert(
        fc.property(arbTick(), (tick) => {
          expect(chartTimeToTick(tickToChartTime(tick))).toBe(tick);
        }),
      );
    });
  });

  describe('formatChartTime', () => {
    it('formats the game time', () => {
      expect(formatChartTime(tickToChartTime(GAME_START_TICK + 570))).toBe(
        'Mo., 01.04.2030, 09:30',
      );
    });

    it('formats the first weekly candle before the epoch (tick −2,880)', () => {
      expect(tickToChartTime(-2880) * MS_PER_SECOND).toBe(Date.UTC(2019, 11, 30));
      expect(formatChartTime(tickToChartTime(-2880))).toBe('Mo., 30.12.2019, 00:00');
    });
  });

  describe('formatTickMark', () => {
    const time = tickToChartTime(
      dateTimeToTick({ year: 2030, month: 4, day: 2, hour: 9, minute: 5 }),
    );

    it('formats years, months, days and times', () => {
      expect(formatTickMark(time, 0)).toBe('2030');
      // The short month name depends on the ICU data (`Apr` or `Apr.`).
      expect(formatTickMark(time, 1)).toMatch(/^Apr/);
      expect(formatTickMark(time, 2)).toBe('02.04.');
      expect(formatTickMark(time, 3)).toBe('09:05');
    });
  });

  describe('toLinePoints and toChartCandles', () => {
    const candles: Candle[] = [
      { tick: GAME_START_TICK, open: 10, high: 12, low: 9, close: 11 },
      { tick: GAME_START_TICK + 1, open: 11, high: Number.NaN, low: Number.NaN, close: 10.5 },
    ];

    it('uses the close for line points', () => {
      expect(toLinePoints(candles)).toEqual([
        { time: tickToChartTime(GAME_START_TICK), value: 11 },
        { time: tickToChartTime(GAME_START_TICK + 1), value: 10.5 },
      ]);
    });

    it('falls back to open and close when high and low are missing', () => {
      expect(toChartCandles(candles)[1]).toEqual({
        time: tickToChartTime(GAME_START_TICK + 1),
        open: 11,
        high: 11,
        low: 10.5,
        close: 10.5,
      });
    });
  });

  describe('readChartColors', () => {
    it('reads the trimmed token values', () => {
      const values: Record<string, string> = {
        '--pgo-surface': ' #121821',
        '--pgo-fg': '#e6edf3',
        '--pgo-fg-muted': '#9aa7b4',
        '--pgo-border': '#2a3442',
        '--pgo-accent': '#4c9eff',
        '--pgo-up': '#26c281',
        '--pgo-down': '#ff6b6b ',
        '--pgo-chart-1': '#000001',
        '--pgo-chart-2': '#000002',
        '--pgo-chart-3': '#000003',
        '--pgo-chart-4': '#000004',
        '--pgo-chart-5': '#000005',
        '--pgo-chart-6': ' #000006',
      };
      expect(readChartColors({ getPropertyValue: (name) => values[name] ?? '' })).toEqual({
        background: '#121821',
        text: '#e6edf3',
        textMuted: '#9aa7b4',
        grid: '#2a3442',
        line: '#4c9eff',
        up: '#26c281',
        down: '#ff6b6b',
        categories: {
          'chart-1': '#000001',
          'chart-2': '#000002',
          'chart-3': '#000003',
          'chart-4': '#000004',
          'chart-5': '#000005',
          'chart-6': '#000006',
        },
      });
    });
  });

  describe('isPrepended', () => {
    const candle = (tick: number): Candle => ({ tick, open: 1, high: 1, low: 1, close: 1 });
    const loaded = [candle(10), candle(20)];

    it('detects older candles in front of the loaded ones', () => {
      expect(isPrepended(loaded, [candle(0), candle(10), candle(20)])).toBe(true);
      expect(isPrepended(loaded, [candle(10), candle(20)])).toBe(true);
    });

    it('detects any block of older candles in front of the loaded ones', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 40 }),
          fc.integer({ min: 1, max: 40 }),
          (older, count) => {
            const current = Array.from({ length: count }, (_, i) => candle(TICKS_PER_DAY + i));
            const prepended = Array.from({ length: older }, (_, i) => candle(i));
            expect(isPrepended(current, [...prepended, ...current])).toBe(true);
          },
        ),
      );
    });

    it('treats other data as a new data set', () => {
      expect(isPrepended([], loaded)).toBe(false);
      expect(isPrepended(loaded, [candle(10), candle(20), candle(30)])).toBe(false);
      expect(isPrepended(loaded, [candle(20)])).toBe(false);
    });
  });

  describe('shouldRequestHistory', () => {
    const trigger = { armed: true, userMoved: true, from: 3 };

    it('asks for older candles when the user moved the view to the oldest candle', () => {
      expect(shouldRequestHistory(trigger)).toBe(true);
    });

    it('ignores the fitted view of a new data set', () => {
      expect(shouldRequestHistory({ ...trigger, userMoved: false })).toBe(false);
    });

    it('asks only once per data set', () => {
      expect(shouldRequestHistory({ ...trigger, armed: false })).toBe(false);
    });

    it('waits until the view reaches the threshold', () => {
      expect(shouldRequestHistory({ ...trigger, from: HISTORY_THRESHOLD_BARS })).toBe(false);
      expect(shouldRequestHistory({ ...trigger, from: null })).toBe(false);
    });
  });

  describe('incrementalUpdates', () => {
    const candle = (tick: number, close = 1): Candle => ({ tick, open: 1, high: 2, low: 0, close });
    const loaded = [candle(0), candle(15), candle(30)];

    it('updates the newest candle when only it changed', () => {
      const running = candle(30, 1.5);
      expect(incrementalUpdates(loaded, [loaded[0], loaded[1], running])).toEqual([running]);
    });

    it('finishes the newest candle and appends the new one', () => {
      const finished = candle(30, 1.7);
      const next = candle(45);
      expect(incrementalUpdates(loaded, [...loaded.slice(0, 2), finished, next])).toEqual([
        finished,
        next,
      ]);
      expect(incrementalUpdates(loaded, [...loaded, next])).toEqual([next]);
    });

    it('updates nothing for the same candles in a new array', () => {
      expect(incrementalUpdates(loaded, [...loaded])).toEqual([]);
    });

    it('needs setData for every other change', () => {
      expect(incrementalUpdates([], loaded)).toBeNull();
      expect(incrementalUpdates(loaded, [candle(-15), ...loaded])).toBeNull();
      expect(incrementalUpdates(loaded, [loaded[0], candle(15, 3), loaded[2]])).toBeNull();
      expect(incrementalUpdates(loaded, [loaded[0], loaded[1], candle(31)])).toBeNull();
      expect(incrementalUpdates(loaded, [...loaded, candle(45), candle(60)])).toBeNull();
      expect(incrementalUpdates(loaded, loaded.slice(0, 2))).toBeNull();
    });

    it('compares with the given equality', () => {
      const same = (a: Candle, b: Candle): boolean => a.tick === b.tick && a.close === b.close;
      expect(
        incrementalUpdates(
          loaded,
          loaded.map((c) => ({ ...c })),
          same,
        ),
      ).toEqual([]);
    });
  });

  describe('candleAt', () => {
    it('finds the candle that starts at a tick', () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(fc.integer({ min: -5000, max: 5000 })),
          fc.integer(),
          (ticks, probe) => {
            const candles = [...ticks]
              .sort((a, b) => a - b)
              .map((tick): Candle => ({ tick, open: 1, high: 1, low: 1, close: tick }));
            const wanted = ticks.includes(probe) ? probe : (ticks[0] ?? probe);
            // Oracle: a linear search.
            expect(candleAt(candles, wanted)).toBe(candles.find((c) => c.tick === wanted));
            expect(candleAt(candles, probe)).toBe(candles.find((c) => c.tick === probe));
          },
        ),
      );
    });
  });
});
