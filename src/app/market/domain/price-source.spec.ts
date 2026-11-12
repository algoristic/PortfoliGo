import { dateTimeToTick, dayIndex, dayStartTick } from '@app/clock/domain/calendar-logic';

import { Checksum } from '@app/simulation/util/checksum';

import { deriveSeedKey } from '@app/simulation/util/seed';

import { generateWorld } from '@app/world/domain/world-generator';

import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { isMarketDay } from './market-calendar';
import { marketChecksum } from './market-checksum';
import { createMarketContext } from './market-context';
import { createFactorHistory } from './market-history';
import { advanceMarket, createMarketState } from './market-step';
import { priceFromLog } from './price-logic';
import { PriceSource } from './price-source';

/** Changes when the minute prices for existing seeds change; then raise `simVersion` (TS §15). */
const GOLDEN_1_MINUTES_2020 = 'c00e3f1b7849032b665890e4e3e1028c';

const seedKey = deriveSeedKey('golden-1');
const context = createMarketContext(seedKey, generateWorld(seedKey), DEFAULT_MARKET_CONFIG);
const { layout } = context;
const floor = DEFAULT_MARKET_CONFIG.priceFloor;
const endOf2020 = dayIndex(dateTimeToTick({ year: 2021, month: 1, day: 1 }));
/** Thursday, 31.12.2020: the last stepped day. */
const today = endOf2020 - 1;
const history = createFactorHistory();
const state = createMarketState(context);
const live = new PriceSource(context, history, state);
const liveDays: number[] = [];
advanceMarket(context, state, endOf2020, {
  history,
  onDay: (day) => {
    if (day.day >= endOf2020 - 8) {
      live.rememberDay(day);
      liveDays.push(day.day);
    }
  },
});
const endOfToday = dayStartTick(today + 1) - 1;

function session(i: number): { open: number; close: number } {
  return {
    open: layout.boundaries[layout.openBoundary[i]],
    close: layout.boundaries[layout.closeBoundary[i]],
  };
}

function tickAt(day: number, minute: number): number {
  return dayStartTick(day) + minute;
}

describe('PriceSource', () => {
  describe('determinism', () => {
    it('matches the golden checksum over a fixed sample of minute curves', () => {
      const source = new PriceSource(context, history, state);
      const checksum = new Checksum();
      for (const day of [0, 47, 160, 287, today]) {
        expect(isMarketDay(day)).toBe(true);
        for (const i of [0, 57, 123, 199]) {
          checksum.addFloat64Array(source.minuteCurve(i, day, endOfToday));
        }
      }
      expect(checksum.digest()).toBe(GOLDEN_1_MINUTES_2020);
    });

    it('never changes the market state', () => {
      const before = marketChecksum(state);
      const source = new PriceSource(context, history, state);
      source.candles(5, '1d', 0, endOfToday, endOfToday);
      source.priceAt(9, endOfToday, endOfToday);
      expect(marketChecksum(state)).toBe(before);
    });

    it('gives the same minutes live, recomputed and after discarding the caches', () => {
      const recomputed = new PriceSource(context, history, state, { cachedDays: 2 });
      for (const day of liveDays) {
        for (const i of [0, 31, 99, 150, 199]) {
          const liveCurve = live.minuteCurve(i, day, endOfToday);
          expect(recomputed.minuteCurve(i, day, endOfToday)).toEqual(liveCurve);
          recomputed.clearCaches();
          expect(recomputed.minuteCurve(i, day, endOfToday)).toEqual(liveCurve);
        }
      }
      const from = dayStartTick(liveDays[0]);
      for (const resolution of ['5m', '1d'] as const) {
        expect(recomputed.candles(77, resolution, from, endOfToday, endOfToday)).toEqual(
          live.candles(77, resolution, from, endOfToday, endOfToday),
        );
      }
    });
  });

  describe('priceAt', () => {
    const i = 12;
    const { open, close } = session(i);
    const curve = live.minuteCurve(i, today, endOfToday);

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
        priceFromLog(layout.logBase[i], floor),
      );
    });
  });

  describe('query limit', () => {
    const i = 3;
    const { open, close } = session(i);
    const now = tickAt(today, open + 95);

    it('rejects ticks after now and days that have not been stepped', () => {
      expect(() => live.priceAt(i, now + 1, now)).toThrow(RangeError);
      expect(() => live.minuteCurve(i, today + 1, now)).toThrow(RangeError);
      const later = tickAt(endOf2020, open + 5);
      expect(() => live.priceAt(i, later, later)).toThrow(RangeError);
    });

    it('cuts curves and candles at now', () => {
      const price = live.priceAt(i, now, now);
      const curve = live.minuteCurve(i, today, now);
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

  describe('performance', () => {
    it('computes the minute chart of a past day with cold caches within the CI bound', () => {
      const source = new PriceSource(context, history, state);
      const day = dayIndex(dateTimeToTick({ year: 2020, month: 6, day: 30 }));
      const start = performance.now();
      const candles = source.candles(
        42,
        '1m',
        dayStartTick(day),
        dayStartTick(day + 1),
        endOfToday,
      );
      const duration = performance.now() - start;
      console.info(`minute chart of a past day: ${duration.toFixed(1)} ms`);
      expect(candles.length).toBeGreaterThan(300);
      expect(duration).toBeLessThan(200);
    });
  });
});
