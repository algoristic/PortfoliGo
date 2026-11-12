import { dateTimeToTick, GAME_START_TICK } from '@app/clock/domain/calendar-logic';
import { Candle } from '@app/market/domain/models/candle.model';

import {
  chartTimeToTick,
  formatChartTime,
  formatTickMark,
  HISTORY_THRESHOLD_BARS,
  isPrepended,
  readChartColors,
  shouldRequestHistory,
  tickToChartTime,
  toChartCandles,
  toLinePoints,
} from './price-chart.utils';

const MS_PER_SECOND = 1000;

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

    it('round-trips with chartTimeToTick', () => {
      for (const tick of [0, 1, GAME_START_TICK, GAME_START_TICK + 12345]) {
        expect(chartTimeToTick(tickToChartTime(tick))).toBe(tick);
      }
    });
  });

  describe('formatChartTime', () => {
    it('formats the game time', () => {
      expect(formatChartTime(tickToChartTime(GAME_START_TICK + 570))).toBe(
        'Mo., 01.04.2030, 09:30',
      );
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
      };
      expect(readChartColors({ getPropertyValue: (name) => values[name] ?? '' })).toEqual({
        background: '#121821',
        text: '#e6edf3',
        textMuted: '#9aa7b4',
        grid: '#2a3442',
        line: '#4c9eff',
        up: '#26c281',
        down: '#ff6b6b',
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
});
