import {
  candleBlockPlan,
  candleQueryEnd,
  CandleSession,
  earliestMarketDay,
  firstCandleTick,
  firstDayFrom,
  hasOlderCandles,
  MAX_INTRADAY_DAYS,
  sessionCandleCount,
  withHighLow,
} from './candle-window';

// Block rules of the candle query (TS §8.2, §11.7). Days and ticks come from `Date.UTC`
// (01.01.2020 is day 0, a Wednesday; tick = game minute).

const EPOCH_MS = Date.UTC(2020, 0, 1);
const DAY_MS = 86_400_000;

function day(year: number, month: number, date: number): number {
  return (Date.UTC(year, month - 1, date) - EPOCH_MS) / DAY_MS;
}

function tick(year: number, month: number, date: number, hour = 0, minute = 0): number {
  return (Date.UTC(year, month - 1, date, hour, minute) - EPOCH_MS) / 60_000;
}

/** 09:00–17:30 */
const XETRA: CandleSession = { open: 540, close: 1050 };
/** 09:30–16:00 */
const NYSE: CandleSession = { open: 570, close: 960 };

describe('candle window', () => {
  describe('sessionCandleCount', () => {
    // Periods start at the open and at every multiple of the period inside the session.
    it.each([
      ['1m', XETRA, 510],
      ['5m', XETRA, 102],
      ['15m', XETRA, 34],
      ['1h', XETRA, 9],
      ['1m', NYSE, 390],
      ['15m', NYSE, 26],
      ['1h', NYSE, 7],
    ] as const)('counts %s candles of a full session', (resolution, session, expected) => {
      expect(sessionCandleCount(resolution, session)).toBe(expected);
    });
  });

  describe('earliestMarketDay', () => {
    it.each([
      ['three market days up to Mon 06.01.2020', day(2020, 1, 6), 3, 0, day(2020, 1, 2)],
      ['one market day up to Sat 04.01.2020', day(2020, 1, 4), 1, 0, day(2020, 1, 3)],
      ['the epoch bounds the block', day(2020, 1, 6), 10, 0, 0],
      ['a lower bound on a Sunday', day(2020, 1, 10), 10, day(2020, 1, 5), day(2020, 1, 5)],
      ['a lower bound after the last day', day(2020, 1, 6), 3, day(2020, 1, 8), day(2020, 1, 8)],
    ])('finds the start for %s', (_label, lastDay, count, minDay, expected) => {
      expect(earliestMarketDay(lastDay, count, minDay)).toBe(expected);
    });
  });

  describe('firstDayFrom', () => {
    it('keeps a day start and moves later ticks to the next day', () => {
      expect(firstDayFrom(tick(2030, 4, 3))).toBe(day(2030, 4, 3));
      expect(firstDayFrom(tick(2030, 4, 3, 0, 1))).toBe(day(2030, 4, 4));
    });
  });

  describe('firstCandleTick', () => {
    it('starts at the open of the epoch for intraday candles', () => {
      expect(firstCandleTick('1m', XETRA)).toBe(tick(2020, 1, 1, 9));
      expect(firstCandleTick('1h', NYSE)).toBe(tick(2020, 1, 1, 9, 30));
    });

    it('starts at the epoch for daily and on Monday 30.12.2019 for weekly candles', () => {
      expect(firstCandleTick('1d', XETRA)).toBe(0);
      expect(firstCandleTick('1w', XETRA)).toBe(tick(2019, 12, 30));
    });
  });

  describe('candleQueryEnd', () => {
    const monday = (hour: number): number => tick(2030, 4, 1, hour);

    it('ends at now without `to` once the session opened', () => {
      expect(candleQueryEnd(undefined, monday(10), XETRA)).toBe(monday(10));
    });

    it('never goes beyond now', () => {
      expect(candleQueryEnd(monday(12), monday(10), XETRA)).toBe(monday(10));
    });

    it('ends yesterday while today’s session has not opened', () => {
      expect(candleQueryEnd(undefined, monday(8), XETRA)).toBe(tick(2030, 4, 1) - 1);
      expect(candleQueryEnd(monday(7), monday(8), XETRA)).toBe(tick(2030, 4, 1) - 1);
    });

    it('keeps an earlier day', () => {
      expect(candleQueryEnd(tick(2030, 3, 29, 8), monday(8), XETRA)).toBe(tick(2030, 3, 29, 8));
    });
  });

  describe('candleBlockPlan', () => {
    const friday = day(2030, 4, 5);

    it('covers `limit` market days for daily candles', () => {
      expect(candleBlockPlan('1d', friday, 5, null, XETRA)).toEqual({
        firstDay: day(2030, 4, 1),
        searchedFrom: tick(2030, 4, 1),
      });
      expect(candleBlockPlan('1d', friday, 6, null, XETRA).firstDay).toBe(day(2030, 3, 29));
    });

    it('starts daily candles at the first day start at or after `from`', () => {
      expect(candleBlockPlan('1d', friday, 100, tick(2030, 4, 3, 12), XETRA)).toEqual({
        firstDay: day(2030, 4, 4),
        searchedFrom: tick(2030, 4, 4),
      });
    });

    it('covers `limit` weeks for weekly candles', () => {
      expect(candleBlockPlan('1w', day(2030, 4, 3), 3, null, XETRA)).toEqual({
        firstDay: day(2030, 3, 18),
        searchedFrom: tick(2030, 3, 18),
      });
    });

    it('reaches the epoch week of weekly candles', () => {
      expect(candleBlockPlan('1w', day(2020, 2, 5), 100, null, XETRA)).toEqual({
        firstDay: 0,
        searchedFrom: tick(2019, 12, 30),
      });
    });

    it('starts weekly candles at the first Monday at or after `from`', () => {
      expect(candleBlockPlan('1w', day(2030, 4, 3), 100, tick(2030, 3, 19), XETRA).firstDay).toBe(
        day(2030, 3, 25),
      );
      expect(candleBlockPlan('1w', day(2030, 4, 3), 100, tick(2030, 3, 18), XETRA).firstDay).toBe(
        day(2030, 3, 18),
      );
    });

    it('covers enough days for the intraday limit plus a partial day', () => {
      // 2,000 minute candles need 4 full sessions of 510 minutes, plus the partial one.
      expect(candleBlockPlan('1m', friday, 2_000, null, XETRA)).toEqual({
        firstDay: day(2030, 4, 1),
        searchedFrom: tick(2030, 4, 1),
      });
      expect(candleBlockPlan('1m', friday, 1, null, XETRA).firstDay).toBe(day(2030, 4, 4));
    });

    it('bounds intraday blocks to 23 market days', () => {
      expect(MAX_INTRADAY_DAYS).toBe(23);
      expect(candleBlockPlan('1h', friday, 2_000, null, XETRA).firstDay).toBe(day(2030, 3, 6));
    });

    it('starts an intraday block at `from` inside its first day', () => {
      const from = tick(2030, 4, 4, 11);
      expect(candleBlockPlan('5m', friday, 2_000, from, XETRA)).toEqual({
        firstDay: day(2030, 4, 4),
        searchedFrom: from,
      });
    });
  });

  describe('hasOlderCandles', () => {
    it('is false only at the first candle since the epoch', () => {
      expect(hasOlderCandles(tick(2020, 1, 1, 9), '1m', XETRA)).toBe(false);
      expect(hasOlderCandles(tick(2020, 1, 1, 9, 1), '1m', XETRA)).toBe(true);
      expect(hasOlderCandles(0, '1d', XETRA)).toBe(false);
      expect(hasOlderCandles(tick(2020, 1, 2), '1d', XETRA)).toBe(true);
      expect(hasOlderCandles(tick(2019, 12, 30), '1w', XETRA)).toBe(false);
      expect(hasOlderCandles(tick(2020, 1, 6), '1w', XETRA)).toBe(true);
    });
  });

  describe('withHighLow', () => {
    it.each([
      [
        { tick: 0, open: 10, high: Number.NaN, low: Number.NaN, close: 12 },
        { tick: 0, open: 10, high: 12, low: 10, close: 12 },
      ],
      [
        { tick: 0, open: 12, high: Number.NaN, low: Number.NaN, close: 10 },
        { tick: 0, open: 12, high: 12, low: 10, close: 10 },
      ],
      [
        { tick: 0, open: 10, high: 13, low: 9, close: 12 },
        { tick: 0, open: 10, high: 13, low: 9, close: 12 },
      ],
    ])('fills a missing high and low from open and close', (candle, expected) => {
      expect(withHighLow(candle)).toEqual(expected);
    });
  });
});
