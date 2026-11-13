import { intradayCandleBlock, latestCandle, supportOpenClose } from './chart-candles';
import { PriceSource } from './price-source';
import { indexSeries } from './series';
import { GoldenYear, goldenYear } from './testing/golden-year';

// Candle blocks and the newest candle of a chart (TS §8.2, §8.4) on the golden year. Oracles: the
// minute curves (`minuteCurve`, `priceAt`) of the price source, calendar values from `Date.UTC`.

const EPOCH_MS = Date.UTC(2020, 0, 1);
const DAY_MS = 86_400_000;

function day(year: number, month: number, date: number): number {
  return (Date.UTC(year, month - 1, date) - EPOCH_MS) / DAY_MS;
}

function tick(year: number, month: number, date: number, hour = 0, minute = 0): number {
  return (Date.UTC(year, month - 1, date, hour, minute) - EPOCH_MS) / 60_000;
}

const STOCK = 42;

describe('chart candles', () => {
  let golden: GoldenYear;
  let prices: PriceSource;
  let open: number;
  let close: number;

  beforeAll(() => {
    golden = goldenYear();
    prices = golden.live;
    ({ open, close } = prices.session(STOCK));
  });

  describe('intradayCandleBlock', () => {
    it('answers every minute of a past day', () => {
      const date = [2020, 6, 30] as const;
      const curve = prices.minuteCurve(STOCK, day(...date), golden.endOfToday);
      const block = intradayCandleBlock(
        prices,
        STOCK,
        '1m',
        { from: tick(...date), to: tick(...date, 23, 59), limit: 2_000 },
        golden.endOfToday,
      );
      expect(block.candles).toHaveLength(close - open);
      expect(block.hasOlder).toBe(true);
      block.candles.forEach((candle, j) => {
        expect(candle.tick).toBe(tick(...date) + open + j);
        expect(candle.open).toBe(curve[j]);
        expect(candle.close).toBe(curve[j + 1]);
        expect(candle.high).toBe(Math.max(curve[j], curve[j + 1]));
      });
    });

    it('answers the newest `limit` candles up to `to`, ascending', () => {
      const to = tick(2020, 12, 30, 14, 7);
      const block = intradayCandleBlock(
        prices,
        STOCK,
        '5m',
        { from: null, to, limit: 250 },
        golden.endOfToday,
      );
      expect(block.candles).toHaveLength(250);
      expect(block.candles.at(-1)?.tick).toBe(tick(2020, 12, 30, 14, 5));
      const ticks = block.candles.map((candle) => candle.tick);
      expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
      expect(block.hasOlder).toBe(true);
    });

    it('ends at the current tick with a partial candle', () => {
      const now = tick(2020, 12, 31) + open + 63;
      const block = intradayCandleBlock(
        prices,
        STOCK,
        '15m',
        { from: null, to: undefined, limit: 3 },
        now,
      );
      expect(block.candles.at(-1)?.tick).toBe(
        tick(2020, 12, 31) + Math.floor((open + 63) / 15) * 15,
      );
      expect(block.candles.at(-1)?.close).toBe(prices.priceAt(STOCK, now, now));
    });

    it('reaches the epoch', () => {
      const block = intradayCandleBlock(
        prices,
        STOCK,
        '1h',
        { from: null, to: tick(2020, 1, 2, 23), limit: 2_000 },
        golden.endOfToday,
      );
      expect(block.hasOlder).toBe(false);
      expect(block.candles[0].tick).toBe(tick(2020, 1, 1) + open);
      expect(block.candles[0].open).toBe(prices.minuteCurve(STOCK, 0, golden.endOfToday)[0]);
    });

    it('answers an empty block before the first candle', () => {
      const block = intradayCandleBlock(
        prices,
        STOCK,
        '1m',
        { from: null, to: tick(2020, 1, 1, 8), limit: 10 },
        golden.endOfToday,
      );
      expect(block).toEqual({ candles: [], hasOlder: false });
    });
  });

  describe('latestCandle', () => {
    it('is the running candle of the session at now', () => {
      const now = tick(2020, 12, 31) + open + 83;
      const candle = latestCandle(prices, STOCK, '1h', now, now);
      expect(candle?.tick).toBe(tick(2020, 12, 31) + Math.floor((open + 83) / 60) * 60);
      expect(candle?.close).toBe(prices.priceAt(STOCK, now, now));
    });

    it('is the last candle of the previous session before the open', () => {
      const now = tick(2020, 12, 28, 1);
      const curve = prices.minuteCurve(STOCK, day(2020, 12, 25), now);
      const candle = latestCandle(prices, STOCK, '1m', now, now);
      expect(candle).toEqual({
        tick: tick(2020, 12, 25) + close - 1,
        open: curve[curve.length - 2],
        high: Math.max(curve[curve.length - 2], curve[curve.length - 1]),
        low: Math.min(curve[curve.length - 2], curve[curve.length - 1]),
        close: curve[curve.length - 1],
      });
    });

    it('is the finished daily candle of an earlier day', () => {
      const now = tick(2020, 12, 31, 12);
      const curve = prices.minuteCurve(STOCK, day(2020, 12, 30), now);
      const candle = latestCandle(prices, STOCK, '1d', tick(2020, 12, 31) - 1, now);
      expect(candle?.tick).toBe(tick(2020, 12, 30));
      expect(candle?.open).toBe(curve[0]);
      expect(candle?.close).toBe(curve[curve.length - 1]);
    });

    it('is the weekly candle of the running week', () => {
      const now = golden.endOfToday;
      const candle = latestCandle(prices, STOCK, '1w', now, now);
      expect(candle?.tick).toBe(tick(2020, 12, 28));
      expect(candle?.open).toBe(prices.minuteCurve(STOCK, day(2020, 12, 28), now)[0]);
      expect(candle?.close).toBe(prices.priceAt(STOCK, now, now));
    });

    it('is null before the first candle', () => {
      expect(latestCandle(prices, STOCK, '1d', tick(2020, 1, 1, 8), golden.endOfToday)).toBeNull();
    });
  });

  describe('supportOpenClose', () => {
    it.each([
      ['a share', () => STOCK],
      ['an index', () => indexSeries(golden.context, 0)],
    ])('equals the ends of the minute curves of %s', (_label, seriesOf) => {
      const series = seriesOf();
      const days = [day(2020, 3, 2), day(2020, 3, 3), day(2020, 7, 15), day(2020, 7, 18)];
      const result = supportOpenClose(golden.context, golden.history, golden.tables, series, days);
      // 18.07.2020 is a Saturday.
      expect([...result.keys()]).toEqual(days.slice(0, 3));
      for (const [d, { open: first, close: last }] of result) {
        const curve = prices.minuteCurve(series, d, golden.endOfToday);
        expect(first).toBe(curve[0]);
        expect(last).toBe(curve[curve.length - 1]);
      }
    });
  });
});
