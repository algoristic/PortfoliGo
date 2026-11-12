import fc from 'fast-check';

import { dateTimeToTick, dayIndex, dayStartTick } from '@app/clock/domain/calendar-logic';
import { MINUTES_PER_DAY } from '@app/clock/domain/models/time.model';
import { priceStep } from '@app/shared/domain/price-step-logic';
import { deriveSeedKey } from '@app/simulation/util/seed';
import { SIZE_CLASSES } from '@app/world/domain/models/taxonomy.model';
import { World } from '@app/world/domain/models/world.model';
import { generateWorld } from '@app/world/domain/world-generator';

import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { GOLDEN_SEED } from './golden-master';
import { createMarketContext, MarketContext } from './market-context';
import { createFactorHistory } from './market-history';
import { advanceMarket, createMarketState } from './market-step';
import { MARKET_PHASES } from './models/market-config.model';
import { PriceSource } from './price-source';
import { marketSpread, quote } from './quote-logic';
import { etfSeries, indexSeries } from './series';

const { base, phaseFactor, closedUnderlyingFactor } = DEFAULT_MARKET_CONFIG.spreads;

let world: World;
let context: MarketContext;

beforeAll(() => {
  const seedKey = deriveSeedKey(GOLDEN_SEED);
  world = generateWorld(seedKey);
  context = createMarketContext(seedKey, world, DEFAULT_MARKET_CONFIG);
});

function sessionMinutes(i: number): { open: number; close: number } {
  const { layout } = context;
  return {
    open: layout.boundaries[layout.openBoundary[i]],
    close: layout.boundaries[layout.closeBoundary[i]],
  };
}

describe('quote-logic', () => {
  describe('createSpreadLayout', () => {
    it('keeps the base spread inside the range of the size class, tighter for larger values', () => {
      const { etfs, spreads } = context;
      for (const size of SIZE_CLASSES) {
        const members = world.companies
          .flatMap((company, i) =>
            company.size === size ? [{ cap: company.marketCap, spread: spreads.stockBase[i] }] : [],
          )
          .sort((a, b) => a.cap - b.cap);
        expect(members.length).toBeGreaterThan(1);
        for (let n = 0; n < members.length; n++) {
          expect(members[n].spread).toBeGreaterThanOrEqual(base[size][0] - 1e-15);
          expect(members[n].spread).toBeLessThanOrEqual(base[size][1] + 1e-15);
          if (n > 0) {
            expect(members[n].spread).toBeLessThanOrEqual(members[n - 1].spread);
          }
        }
        expect(members[0].spread).toBeCloseTo(base[size][1], 15);
        expect(members[members.length - 1].spread).toBeCloseTo(base[size][0], 15);
      }
      for (let e = 0; e < etfs.ids.length; e++) {
        expect(spreads.etfBase[e]).toBeGreaterThanOrEqual(base.etf[0] - 1e-15);
        expect(spreads.etfBase[e]).toBeLessThanOrEqual(base.etf[1] + 1e-15);
      }
    });
  });

  describe('marketSpread', () => {
    it('uses the base spread in a normal phase while the exchange is open', () => {
      const { spreads } = context;
      const { open } = sessionMinutes(0);
      expect(marketSpread(context, 0, 'normal', open + 10)).toBe(spreads.stockBase[0]);
    });

    it('widens with the market phase and when the exchange is closed', () => {
      const { spreads } = context;
      const { open, close } = sessionMinutes(0);
      for (const phase of MARKET_PHASES) {
        expect(marketSpread(context, 0, phase, open)).toBeCloseTo(
          spreads.stockBase[0] * phaseFactor[phase],
          15,
        );
      }
      expect(marketSpread(context, 0, 'normal', close)).toBeCloseTo(
        spreads.stockBase[0] * closedUnderlyingFactor,
        15,
      );
    });

    it('widens the spread of ETFs by the closed share of the underlying', () => {
      const { spreads } = context;
      const series = etfSeries(context, 0);
      const night = marketSpread(context, series, 'normal', 0);
      expect(night).toBeCloseTo(spreads.etfBase[0] * closedUnderlyingFactor, 15);
      const day = marketSpread(context, series, 'normal', 12 * 60);
      expect(day).toBeGreaterThanOrEqual(spreads.etfBase[0]);
      expect(day).toBeLessThan(night);
      expect(marketSpread(context, series, 'normal', MINUTES_PER_DAY)).toBe(night);
    });

    it('rejects indices, which are not tradable', () => {
      expect(() => marketSpread(context, indexSeries(context, 0), 'normal', 600)).toThrow(
        RangeError,
      );
    });
  });

  describe('quote', () => {
    // Hand-computed at the grid boundaries of TS §6.7: two decimals from 10 €, three from 1 €,
    // four below; the bid is rounded down and the ask up, at least one step apart.
    it.each([
      { mid: 10, spread: 0.001, bid: 9.99, ask: 10.01 },
      { mid: 9.999, spread: 0.001, bid: 9.994, ask: 10.004 },
      { mid: 1, spread: 0.001, bid: 0.999, ask: 1.001 },
      { mid: 0.9999, spread: 0.001, bid: 0.9994, ask: 1.0004 },
      { mid: 50, spread: 0, bid: 50, ask: 50.01 },
    ])('quotes $bid / $ask around $mid at a spread of $spread', ({ mid, spread, bid, ask }) => {
      expect(quote(mid, spread)).toEqual({ mid, spread, bid, ask });
    });

    it('keeps bid ≤ mid ≤ ask on the grid of the mid, at least one step apart', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 1e-4, max: 1e4, noNaN: true }),
          fc.double({ min: 0, max: 0.05, noNaN: true }),
          (mid, spread) => {
            const { bid, ask } = quote(mid, spread);
            const step = priceStep(mid);
            const stepsPerEuro = Math.round(1 / step);
            expect(bid).toBeLessThan(ask);
            expect(bid).toBeLessThanOrEqual(mid * (1 + 1e-12));
            expect(ask).toBeGreaterThanOrEqual(mid * (1 - 1e-12));
            expect(ask - bid).toBeGreaterThanOrEqual(step * (1 - 1e-9));
            for (const price of [bid, ask]) {
              expect(
                Math.abs(price * stepsPerEuro - Math.round(price * stepsPerEuro)),
              ).toBeLessThan(1e-6);
            }
            // The grid widens the spread by less than one step on each side.
            expect(ask - bid).toBeLessThan(mid * spread + 2 * step + 1e-9);
          },
        ),
      );
    });
  });

  describe('PriceSource.quoteAt', () => {
    const endOfJanuary = dayIndex(dateTimeToTick({ year: 2020, month: 2, day: 1 }));
    const now = dayStartTick(endOfJanuary) - 1;
    let source: PriceSource;

    beforeAll(() => {
      const history = createFactorHistory();
      const state = createMarketState(context);
      advanceMarket(context, state, endOfJanuary, { history });
      source = new PriceSource(context, history, state);
    });

    it('quotes around the price with the market spread plus the venue mark-up', () => {
      const { spreads } = context;
      // Thursday, 30.01.2020, during the session of share 0.
      const day = endOfJanuary - 2;
      const tick = dayStartTick(day) + sessionMinutes(0).open + 60;
      const result = source.quoteAt(0, tick, now, 0.001);
      expect(result.mid).toBe(source.priceAt(0, tick, now));
      expect(result.spread).toBeCloseTo(spreads.stockBase[0] * phaseFactor.normal + 0.001, 12);
      expect(result.bid).toBeLessThan(result.mid);
      expect(result.ask).toBeGreaterThan(result.mid);
    });

    it('treats a weekend as closed and uses the last price', () => {
      const { spreads } = context;
      const saturday = dayIndex(dateTimeToTick({ year: 2020, month: 1, day: 25 }));
      const tick = dayStartTick(saturday) + 600;
      const result = source.quoteAt(0, tick, now, 0);
      expect(result.mid).toBe(source.priceAt(0, tick, now));
      expect(result.spread / spreads.stockBase[0]).toBeGreaterThanOrEqual(closedUnderlyingFactor);
    });
  });
});
