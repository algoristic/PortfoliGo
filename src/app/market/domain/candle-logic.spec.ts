import fc from 'fast-check';

import { dayIndex, dayStartTick, weekdayOfDay } from '@app/clock/domain/calendar-logic';
import { MINUTES_PER_DAY } from '@app/clock/domain/models/time.model';

import {
  dailyCandle,
  dailyCandlesFromSupport,
  intradayCandles,
  intradayMinutes,
  weeklyCandles,
} from './candle-logic';
import { createMarketDay } from './market-step';
import { Candle, IntradayResolution } from './models/candle.model';
import { seriesCount } from './series';
import { miniMarket } from './testing/mini-market';

// 06.01.2020 is a Monday (day 5).
const MONDAY = 5;
const OPEN = 540;

/** Session 09:00–09:12 with prices 10, 11, … 22. */
const curve = Float64Array.from({ length: 13 }, (_value, j) => 10 + j);

const RESOLUTION_MINUTES: readonly [IntradayResolution, number][] = [
  ['1m', 1],
  ['5m', 5],
  ['15m', 15],
  ['1h', 60],
];

/** One-minute candles by definition: minute j runs from value j to value j + 1 (or `last`). */
function referenceMinuteCandles(
  prices: ArrayLike<number>,
  day: number,
  open: number,
  last: number,
): Candle[] {
  const candles: Candle[] = [];
  for (let j = 0; j <= Math.min(last, prices.length - 2); j++) {
    const end = Math.min(j + 1, last);
    candles.push({
      tick: dayStartTick(day) + open + j,
      open: prices[j],
      high: Math.max(prices[j], prices[end]),
      low: Math.min(prices[j], prices[end]),
      close: prices[end],
    });
  }
  return candles;
}

/** Candles grouped by `key`: open of the first, close of the last, extremes of all. */
function aggregate(candles: readonly Candle[], key: (candle: Candle) => number): Candle[] {
  const groups: Candle[] = [];
  let currentKey = Number.NaN;
  for (const candle of candles) {
    const last = groups[groups.length - 1];
    if (last === undefined || key(candle) !== currentKey) {
      groups.push({ ...candle });
      currentKey = key(candle);
      continue;
    }
    last.high = Math.max(last.high, candle.high);
    last.low = Math.min(last.low, candle.low);
    last.close = candle.close;
  }
  return groups;
}

/** A session: positive prices, an open minute and a last known index inside it. */
const arbSession = fc
  .array(fc.double({ min: 0.01, max: 1000, noNaN: true }), { minLength: 2, maxLength: 400 })
  .chain((prices) =>
    fc.record({
      prices: fc.constant(prices),
      open: fc.integer({ min: 0, max: MINUTES_PER_DAY - (prices.length - 1) }),
      last: fc.integer({ min: 0, max: prices.length - 1 }),
    }),
  );

describe('candle logic', () => {
  describe('intradayMinutes', () => {
    it.each(RESOLUTION_MINUTES)('gives %s periods of %i minutes', (resolution, minutes) => {
      expect(intradayMinutes(resolution)).toBe(minutes);
    });
  });

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

    it('aggregates the minutes of each period of the day, for any session', () => {
      fc.assert(
        fc.property(arbSession, ({ prices, open, last }) => {
          const minutes = referenceMinuteCandles(prices, MONDAY, open, last);
          for (const [resolution, length] of RESOLUTION_MINUTES) {
            const expected = aggregate(minutes, (candle) =>
              Math.floor((candle.tick - dayStartTick(MONDAY)) / length),
            );
            expect(intradayCandles(prices, MONDAY, open, resolution, last)).toEqual(expected);
          }
        }),
      );
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

    it('summarizes the minute candles of the session up to the last known value', () => {
      fc.assert(
        fc.property(arbSession, ({ prices, open, last }) => {
          const [summary] = aggregate(referenceMinuteCandles(prices, MONDAY, open, last), () => 0);
          const candle = dailyCandle(prices, MONDAY, last);
          expect(candle.tick).toBe(dayStartTick(MONDAY));
          expect(candle.open).toBe(prices[0]);
          expect(candle.close).toBe(prices[last]);
          expect({ ...candle, tick: summary.tick }).toEqual(summary);
        }),
      );
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

    it('aggregates any ascending daily candles per calendar week', () => {
      const arbDaily = fc
        .uniqueArray(fc.integer({ min: 0, max: 3000 }), { minLength: 1, maxLength: 80 })
        .chain((days) =>
          fc.tuple(
            fc.constant([...days].sort((a, b) => a - b)),
            fc.array(fc.double({ min: 1, max: 100, noNaN: true }), {
              minLength: days.length * 2,
              maxLength: days.length * 2,
            }),
          ),
        )
        .map(([days, values]) =>
          days.map((day, n) => {
            const [a, b] = [values[2 * n], values[2 * n + 1]];
            return {
              tick: dayStartTick(day),
              open: a,
              high: Math.max(a, b) + 1,
              low: Math.min(a, b) - 0.5,
              close: b,
            };
          }),
        );
      fc.assert(
        fc.property(arbDaily, (daily) => {
          const mondayOf = (candle: Candle): number => {
            const day = dayIndex(candle.tick);
            return day - weekdayOfDay(day);
          };
          const expected = aggregate(daily, mondayOf).map((week) => ({
            ...week,
            tick: dayStartTick(mondayOf(week)),
          }));
          expect(weeklyCandles(daily)).toEqual(expected);
        }),
      );
    });
  });

  describe('dailyCandlesFromSupport', () => {
    it('leaves high and low open', () => {
      const { context } = miniMarket();
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
