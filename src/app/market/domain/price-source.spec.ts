import { dateTimeToTick, dayIndex, dayStartTick } from '@app/clock/domain/calendar-logic';

import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { isMarketDay } from './market-calendar';
import { priceFromLog } from './price-logic';
import { PriceSource } from './price-source';
import { END_OF_2020_DAY, GoldenYear, goldenYear } from './testing/golden-year';

// Query independence, cold versus live curves and the "nothing after now" rule are properties in
// `market-properties.spec.ts`; the golden minute checksum lives in `golden-master.spec.ts`. Here:
// the boundary cases of a query on the golden year.

describe('PriceSource', () => {
  let golden: GoldenYear;
  let live: PriceSource;
  let today: number;
  let endOfToday: number;

  function session(i: number): { open: number; close: number } {
    const { layout } = golden.context;
    return {
      open: layout.boundaries[layout.openBoundary[i]],
      close: layout.boundaries[layout.closeBoundary[i]],
    };
  }

  function tickAt(day: number, minute: number): number {
    return dayStartTick(day) + minute;
  }

  beforeAll(() => {
    golden = goldenYear();
    ({ live, today, endOfToday } = golden);
  });

  describe('priceAt', () => {
    const i = 12;
    let open: number;
    let close: number;
    let curve: Float64Array;

    beforeAll(() => {
      ({ open, close } = session(i));
      curve = live.minuteCurve(i, today, endOfToday);
    });

    it('returns the minute value during the session', () => {
      expect(live.priceAt(i, tickAt(today, open), endOfToday)).toBe(curve[0]);
      expect(live.priceAt(i, tickAt(today, open + 17), endOfToday)).toBe(curve[17]);
      expect(live.priceAt(i, tickAt(today, close - 1), endOfToday)).toBe(curve[close - open - 1]);
    });

    it('keeps the close after the session and until the next open', () => {
      expect(live.priceAt(i, tickAt(today, close), endOfToday)).toBe(curve[close - open]);
      expect(live.priceAt(i, endOfToday, endOfToday)).toBe(curve[close - open]);
      const previous = live.minuteCurve(i, today - 1, endOfToday);
      expect(live.priceAt(i, tickAt(today, open - 1), endOfToday)).toBe(
        previous[previous.length - 1],
      );
    });

    it('keeps the Friday close over the weekend', () => {
      // 26./27.12.2020 is a weekend, 25.12. a Friday (no holidays in stage 1).
      const saturday = dayIndex(dateTimeToTick({ year: 2020, month: 12, day: 26 }));
      expect(isMarketDay(saturday)).toBe(false);
      const friday = live.minuteCurve(i, saturday - 1, endOfToday);
      const fridayClose = friday[friday.length - 1];
      expect(live.priceAt(i, tickAt(saturday, 600), endOfToday)).toBe(fridayClose);
      expect(live.priceAt(i, tickAt(saturday + 2, open - 1), endOfToday)).toBe(fridayClose);
    });

    it('returns the start price before the first open', () => {
      expect(live.priceAt(i, tickAt(0, open - 1), endOfToday)).toBe(
        priceFromLog(golden.context.layout.logBase[i], DEFAULT_MARKET_CONFIG.priceFloor),
      );
    });
  });

  describe('query limit', () => {
    const i = 3;
    let open: number;
    let close: number;
    let now: number;

    beforeAll(() => {
      ({ open, close } = session(i));
      now = tickAt(today, open + 95);
    });

    it('rejects ticks after now and days that have not been stepped', () => {
      expect(() => live.priceAt(i, now + 1, now)).toThrow(RangeError);
      expect(() => live.minuteCurve(i, today + 1, now)).toThrow(RangeError);
      const later = tickAt(END_OF_2020_DAY, open + 5);
      expect(() => live.priceAt(i, later, later)).toThrow(RangeError);
    });

    it('cuts curves and candles at now', () => {
      const price = live.priceAt(i, now, now);
      const curve = live.minuteCurve(i, today, now);
      // From the open up to and including minute 95 of the session.
      expect(curve).toHaveLength(96);
      expect(curve[95]).toBe(price);

      const from = dayStartTick(today - 3);
      for (const resolution of ['1m', '5m', '15m', '1h', '1d', '1w'] as const) {
        const candles = live.candles(i, resolution, from, endOfToday + 10_000, now);
        expect(candles.every((candle) => candle.tick <= now)).toBe(true);
        expect(candles[candles.length - 1].close).toBe(price);
      }
      const today1d = live.candles(i, '1d', dayStartTick(today), now, now)[0];
      expect(today1d.high).toBe(Math.max(...curve));
      expect(today1d.low).toBe(Math.min(...curve));
    });

    it('has no candle for today before the open', () => {
      const beforeOpen = tickAt(today, open - 1);
      expect(live.minuteCurve(i, today, beforeOpen)).toHaveLength(0);
      expect(live.candles(i, '1d', dayStartTick(today), beforeOpen, beforeOpen)).toHaveLength(0);
      expect(live.candles(i, '1m', dayStartTick(today), beforeOpen, beforeOpen)).toHaveLength(0);
      expect(close).toBeGreaterThan(open);
    });
  });

  describe('candles', () => {
    const i = 150;

    it('builds daily candles from the minute curves', () => {
      const fromDay = dayIndex(dateTimeToTick({ year: 2020, month: 10, day: 1 }));
      const daily = live.candles(i, '1d', dayStartTick(fromDay), endOfToday, endOfToday);
      let n = 0;
      for (let day = fromDay; day <= today; day++) {
        if (!isMarketDay(day)) {
          continue;
        }
        const curve = live.minuteCurve(i, day, endOfToday);
        expect(daily[n]).toEqual({
          tick: dayStartTick(day),
          open: curve[0],
          high: Math.max(...curve),
          low: Math.min(...curve),
          close: curve[curve.length - 1],
        });
        n++;
      }
      expect(daily).toHaveLength(n);
    });

    it('builds weekly candles from Monday to Friday', () => {
      const from = dateTimeToTick({ year: 2020, month: 11, day: 4 });
      const weekly = live.candles(i, '1w', from, endOfToday, endOfToday);
      // From Monday 02.11. to Thursday 31.12.: nine weeks.
      expect(weekly).toHaveLength(9);
      expect(weekly[0].tick).toBe(dateTimeToTick({ year: 2020, month: 11, day: 2 }));
      expect(weekly[8].close).toBe(live.priceAt(i, endOfToday, endOfToday));
    });

    it('keeps intraday candles inside the requested range', () => {
      const from = tickAt(today - 1, 600);
      const to = tickAt(today, 600);
      const candles = live.candles(i, '15m', from, to, endOfToday);
      expect(candles.length).toBeGreaterThan(0);
      expect(candles.every((candle) => candle.tick >= from && candle.tick <= to)).toBe(true);
    });
  });
});
