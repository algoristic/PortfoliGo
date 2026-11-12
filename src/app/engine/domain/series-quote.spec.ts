import { TradingHours } from '@app/clock/domain/models/time.model';
import { etfSeries, indexSeries } from '@app/market/domain/series';
import { miniWorld } from '@app/world/domain/testing/mini-world';

import { createGameWorld } from './game-world';
import { GameWorld } from './models/game-world.model';
import { referenceCloseTick, seriesQuote, seriesSession } from './series-quote';
import { TestMarket, TestPrice } from './testing/test-market';

const EPOCH_MS = Date.UTC(2020, 0, 1);

/** Tick of a game date and time, independent of the calendar functions (`Date.UTC`). */
function tick(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return (Date.UTC(year, month - 1, day, hour, minute) - EPOCH_MS) / 60_000;
}

// TS §3.3: Europe 09:00–17:30.
const EUROPE: TradingHours = { open: 540, close: 1_050 };

describe('referenceCloseTick', () => {
  // TS §8.4: the close before the latest session that has opened (Wed 03.04.2030 etc.).
  it.each([
    ['Wed 12:00, in the session', tick(2030, 4, 3, 12), tick(2030, 4, 2, 17, 30)],
    ['Wed 09:00, at the open', tick(2030, 4, 3, 9), tick(2030, 4, 2, 17, 30)],
    ['Wed 08:59, before the open', tick(2030, 4, 3, 8, 59), tick(2030, 4, 1, 17, 30)],
    ['Wed 20:00, after the close', tick(2030, 4, 3, 20), tick(2030, 4, 2, 17, 30)],
    ['Mon 10:00', tick(2030, 4, 8, 10), tick(2030, 4, 5, 17, 30)],
    ['Mon 08:00', tick(2030, 4, 8, 8), tick(2030, 4, 4, 17, 30)],
    ['Sat 12:00', tick(2030, 4, 6, 12), tick(2030, 4, 4, 17, 30)],
    ['Sun 23:59', tick(2030, 4, 7, 23, 59), tick(2030, 4, 4, 17, 30)],
  ])('refers %s to the close of %d', (_label, now, expected) => {
    expect(referenceCloseTick(EUROPE, now)).toBe(expected);
  });
});

describe('series quotes', () => {
  let game: GameWorld;

  beforeAll(() => {
    const { seedKey, world } = miniWorld();
    game = createGameWorld(seedKey, world);
  });

  describe('seriesSession', () => {
    it('gives shares and ETFs the trading hours of their exchange', () => {
      const { world, context } = game;
      const hoursOf = (exchangeId: string): TradingHours => {
        const exchange = world.exchanges.find((candidate) => candidate.id === exchangeId);
        return { open: exchange?.open ?? -1, close: exchange?.close ?? -1 };
      };
      world.companies.forEach((company, i) => {
        expect(seriesSession(context, i)).toEqual(hoursOf(company.exchangeId));
      });
      const firstEtf = context.layout.instrumentIds.length + 2 * context.indices.ids.length;
      world.etfs.forEach((etf, e) => {
        expect(seriesSession(context, firstEtf + e)).toEqual(hoursOf(etf.exchangeId));
      });
    });

    it('closes every index with the exchange that reports it as closing', () => {
      const { context, exchanges } = game;
      context.indices.ids.forEach((_id, x) => {
        const series = indexSeries(context, x);
        const exchange = exchanges.find((session) => session.closingSeries.includes(series));
        expect(seriesSession(context, series).close).toBe(exchange?.close);
      });
    });
  });

  describe('seriesQuote', () => {
    const now = tick(2030, 4, 3, 12);
    const index = (): number => indexSeries(game.context, 0);
    const etf = (): number => etfSeries(game.context, 0);

    function market(): TestMarket {
      const prices: TestPrice[][] = [];
      prices[0] = [
        { tick: tick(2030, 4, 1), price: 100 },
        { tick: tick(2030, 4, 3, 11), price: 110 },
        { tick: now + 1, price: 999 },
      ];
      prices[etf()] = [{ tick: tick(2030, 4, 1), price: 80 }];
      prices[index()] = [
        { tick: tick(2030, 4, 1), price: 2_000 },
        { tick: tick(2030, 4, 3, 11), price: 1_900 },
      ];
      return new TestMarket(prices, 0.002);
    }

    it('quotes the last price against the previous close, never after now', () => {
      const quote = seriesQuote(game.context, market(), 0, now);
      expect(quote).toMatchObject({
        series: 0,
        last: 110,
        previousClose: 100,
        change: 10,
        changeRatio: 0.1,
      });
      expect(quote.bid).toBeLessThan(110);
      expect(quote.ask).toBeGreaterThan(110);
    });

    it('quotes ETFs with bid and ask', () => {
      const quote = seriesQuote(game.context, market(), etf(), now);
      expect(quote).toMatchObject({ last: 80, previousClose: 80, change: 0, changeRatio: 0 });
      expect(quote.bid).toBeLessThan(80);
      expect(quote.ask).toBeGreaterThan(80);
    });

    it('quotes indices without bid and ask', () => {
      expect(seriesQuote(game.context, market(), index(), now)).toEqual({
        series: index(),
        last: 1_900,
        bid: null,
        ask: null,
        previousClose: 2_000,
        change: -100,
        changeRatio: -0.05,
      });
    });
  });
});
