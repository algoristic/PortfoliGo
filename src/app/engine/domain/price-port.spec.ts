import fc from 'fast-check';

import { dateTimeToTick, GAME_START_TICK } from '@app/clock/domain/calendar-logic';
import { etfSeries, seriesCount } from '@app/market/domain/series';
import { priceStep } from '@app/shared/domain/price-step-logic';

import { GameEngine } from './game-engine';
import { PricePort } from './models/price-port.model';
import { miniGame } from './testing/mini-game';
import { TestMarket } from './testing/test-market';

// Contract of the price port (TS §14.1, principle 5): the real adapter (`PriceSource`) and the
// test market answer within the same rules (TS §4.5 rule 7, §6.7).

interface PortUnderTest {
  port: PricePort;
  now: number;
  series: number;
  /** Shares and ETFs; indices are not tradable and have no quote (TS §6.7). */
  tradable: readonly number[];
}

const NOW = dateTimeToTick({ year: 2030, month: 4, day: 10, hour: 12, minute: 7 });

function realAdapter(): PortUnderTest {
  const mini = miniGame();
  const engine = GameEngine.restore(mini.world, mini.start, { monthStarts: mini.monthStarts });
  engine.runUntil(NOW);
  const { context } = mini.world;
  const count = seriesCount(context);
  const shares = context.layout.instrumentIds.length;
  const etfs = Array.from({ length: context.etfs.ids.length }, (_, e) => etfSeries(context, e));
  const tradable = [...Array.from({ length: shares }, (_, i) => i), ...etfs];
  return { port: engine.prices, now: engine.tick, series: count, tradable };
}

function testMarket(): PortUnderTest {
  const port = new TestMarket([
    [{ tick: 0, price: 123.45 }],
    [
      { tick: 0, price: 8 },
      { tick: GAME_START_TICK, price: 7.993 },
      { tick: NOW, price: 0.5123 },
    ],
    [
      { tick: 0, price: 1 },
      { tick: NOW - 10, price: 10.004 },
    ],
  ]);
  return { port, now: NOW, series: 3, tradable: [0, 1, 2] };
}

/** Distance of `price` from the nearest grid point, in grid steps. */
function offGrid(price: number, step: number): number {
  return Math.abs(price / step - Math.round(price / step));
}

describe.each([
  ['PriceSource', realAdapter],
  ['TestMarket', testMarket],
])('price port contract: %s', (_name, create) => {
  let subject: PortUnderTest;

  beforeAll(() => {
    subject = create();
  });

  const arbQuery = (): fc.Arbitrary<{ series: number; tick: number; markup: number }> =>
    fc.record({
      series: fc.constantFrom(...subject.tradable),
      tick: fc.oneof(
        fc.integer({ min: 0, max: subject.now }),
        fc.integer({ min: GAME_START_TICK, max: subject.now }),
      ),
      markup: fc.double({ min: 0, max: 0.002, noNaN: true }),
    });

  it('throws for a tick after now', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: subject.series - 1 }),
        fc.constantFrom(...subject.tradable),
        fc.integer({ min: 1, max: 1e6 }),
        (series, tradable, ahead) => {
          const { port, now } = subject;
          expect(() => port.priceAt(series, now + ahead, now)).toThrow(RangeError);
          expect(() => port.quoteAt(tradable, now + ahead, now, 0)).toThrow(RangeError);
          expect(port.priceAt(series, now, now)).toBeGreaterThan(0);
        },
      ),
      { numRuns: 20 },
    );
  });

  it('quotes bid ≤ mid ≤ ask on the price grid around priceAt', () => {
    fc.assert(
      fc.property(arbQuery(), ({ series, tick, markup }) => {
        const price = subject.port.priceAt(series, tick, subject.now);
        const quote = subject.port.quoteAt(series, tick, subject.now, markup);
        const step = priceStep(price);
        expect(price).toBeGreaterThan(0);
        expect(quote.mid).toBe(price);
        expect(quote.bid).toBeLessThanOrEqual(quote.mid);
        expect(quote.ask).toBeGreaterThanOrEqual(quote.mid);
        expect(quote.ask - quote.bid).toBeGreaterThan(step * (1 - 1e-9));
        expect(offGrid(quote.bid, step)).toBeLessThan(1e-6);
        expect(offGrid(quote.ask, step)).toBeLessThan(1e-6);
      }),
      { numRuns: 25 },
    );
  });

  it('widens the quote with the venue mark-up', () => {
    fc.assert(
      fc.property(arbQuery(), ({ series, tick, markup }) => {
        const plain = subject.port.quoteAt(series, tick, subject.now, 0);
        const marked = subject.port.quoteAt(series, tick, subject.now, markup + 0.001);
        expect(marked.spread).toBeGreaterThan(plain.spread);
        expect(marked.bid).toBeLessThanOrEqual(plain.bid);
        expect(marked.ask).toBeGreaterThanOrEqual(plain.ask);
      }),
      { numRuns: 25 },
    );
  });
});

describe('TestMarket', () => {
  it('returns the given price from its tick on', () => {
    const market = new TestMarket([
      [
        { tick: 100, price: 20 },
        { tick: 200, price: 21.5 },
      ],
    ]);
    expect(market.priceAt(0, 100, 300)).toBe(20);
    expect(market.priceAt(0, 199, 300)).toBe(20);
    expect(market.priceAt(0, 200, 300)).toBe(21.5);
    expect(() => market.priceAt(0, 99, 300)).toThrow(RangeError);
    expect(() => market.priceAt(1, 200, 300)).toThrow(RangeError);
  });

  // TS §6.7: 0.2 % spread around 20 € → 19.98 / 20.02.
  it('quotes the given spread plus the venue mark-up on the price grid', () => {
    const market = new TestMarket([[{ tick: 0, price: 20 }]], 0.001);
    expect(market.quoteAt(0, 5, 5, 0.001)).toEqual({
      mid: 20,
      bid: 19.98,
      ask: 20.02,
      spread: 0.002,
    });
  });
});
