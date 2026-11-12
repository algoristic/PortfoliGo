import { dayStartTick } from '@app/clock/domain/calendar-logic';

import { deriveSeedKey } from '@app/simulation/util/seed';

import { generateWorld } from '@app/world/domain/world-generator';

import {
  dailyCandle,
  dailyCandlesFromSupport,
  intradayCandles,
  weeklyCandles,
} from './candle-logic';
import { createMarketContext } from './market-context';
import { createMarketDay } from './market-step';
import { seriesCount } from './series';

// 06.01.2020 is a Monday (day 5).
const MONDAY = 5;
const OPEN = 540;

/** Session 09:00–09:12 with prices 10, 11, … 22. */
const curve = Float64Array.from({ length: 13 }, (_value, j) => 10 + j);

describe('candle logic', () => {
  describe('intradayCandles', () => {
    it('creates connected one-minute candles from the open to the close', () => {
      const candles = intradayCandles(curve, MONDAY, OPEN, '1m');
      expect(candles).toHaveLength(12);
      expect(candles[0]).toEqual({
        tick: dayStartTick(MONDAY) + OPEN,
        open: 10,
        high: 11,
        low: 10,
        close: 11,
      });
      expect(candles[11].close).toBe(22);
      candles.slice(1).forEach((candle, n) => expect(candle.open).toBe(candles[n].close));
    });

    it('aligns periods to the minute of the day and cuts them at open and close', () => {
      // Session 09:03–09:15: periods start at 09:03, 09:05 and 09:10.
      const candles = intradayCandles(curve, MONDAY, OPEN + 3, '5m');
      expect(candles.map((candle) => candle.tick - dayStartTick(MONDAY))).toEqual([543, 545, 550]);
      expect(candles.map((candle) => [candle.open, candle.close])).toEqual([
        [10, 12],
        [12, 17],
        [17, 22],
      ]);
    });

    it('ends with a partial candle at the last known value', () => {
      const candles = intradayCandles(curve, MONDAY, OPEN, '5m', 7);
      expect(candles).toHaveLength(2);
      expect(candles[1]).toMatchObject({ open: 15, high: 17, low: 15, close: 17 });
      const atStart = intradayCandles(curve, MONDAY, OPEN, '5m', 5);
      expect(atStart[1]).toMatchObject({ open: 15, high: 15, low: 15, close: 15 });
    });

    it('aggregates consistently across resolutions', () => {
      const wavy = Float64Array.from({ length: 121 }, (_value, j) => 50 + Math.sin(j / 3) * j);
      const minutes = intradayCandles(wavy, MONDAY, OPEN, '1m');
      const hours = intradayCandles(wavy, MONDAY, OPEN, '1h');
      expect(hours).toHaveLength(2);
      hours.forEach((hour, h) => {
        const part = minutes.slice(h * 60, (h + 1) * 60);
        expect(hour.open).toBe(part[0].open);
        expect(hour.close).toBe(part[part.length - 1].close);
        expect(hour.high).toBe(Math.max(...part.map((candle) => candle.high)));
        expect(hour.low).toBe(Math.min(...part.map((candle) => candle.low)));
      });
    });
  });

  describe('dailyCandle', () => {
    it('uses open, close and the extremes of the curve', () => {
      const dip = Float64Array.from([10, 8, 12, 11]);
      expect(dailyCandle(dip, MONDAY)).toEqual({
        tick: dayStartTick(MONDAY),
        open: 10,
        high: 12,
        low: 8,
        close: 11,
      });
      expect(dailyCandle(dip, MONDAY, 1)).toMatchObject({ high: 10, low: 8, close: 8 });
    });
  });

  describe('weeklyCandles', () => {
    it('groups the days by week starting on Monday', () => {
      const daily = [MONDAY - 1, MONDAY, MONDAY + 2, MONDAY + 7].map((day, n) => ({
        tick: dayStartTick(day),
        open: n,
        high: 10 + n,
        low: n - 1,
        close: n + 0.5,
      }));
      expect(weeklyCandles(daily)).toEqual([
        { tick: dayStartTick(MONDAY - 7), open: 0, high: 10, low: -1, close: 0.5 },
        { tick: dayStartTick(MONDAY), open: 1, high: 12, low: 0, close: 2.5 },
        { tick: dayStartTick(MONDAY + 7), open: 3, high: 13, low: 2, close: 3.5 },
      ]);
    });
  });

  describe('dailyCandlesFromSupport', () => {
    it('leaves high and low open', () => {
      const seedKey = deriveSeedKey('candles-1');
      const context = createMarketContext(seedKey, generateWorld(seedKey));
      const day = createMarketDay(context);
      day.day = MONDAY;
      day.logOpen.set([0, Math.log(2)]);
      day.logClose.set([-20, 0]);
      const candles = dailyCandlesFromSupport(context, day);
      expect(candles.length).toBe(seriesCount(context));
      expect(candles[0]).toEqual({
        tick: dayStartTick(MONDAY),
        open: 1,
        high: Number.NaN,
        low: Number.NaN,
        close: 0.01,
      });
      expect(candles[1].open).toBeCloseTo(2, 12);
    });
  });
});
