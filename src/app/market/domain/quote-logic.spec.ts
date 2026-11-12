import { dateTimeToTick, dayIndex, dayStartTick } from '@app/clock/domain/calendar-logic';

import { MINUTES_PER_DAY } from '@app/clock/domain/models/time.model';

import { priceStep } from '@app/shared/domain/price-step-logic';

import { deriveSeedKey } from '@app/simulation/util/seed';

import { SIZE_CLASSES } from '@app/world/domain/models/taxonomy.model';

import { generateWorld } from '@app/world/domain/world-generator';

import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { createMarketContext } from './market-context';
import { createFactorHistory } from './market-history';
import { advanceMarket, createMarketState } from './market-step';
import { MARKET_PHASES } from './models/market-config.model';
import { PriceSource } from './price-source';
import { marketSpread, quote } from './quote-logic';
import { etfSeries, indexSeries } from './series';

const seedKey = deriveSeedKey('golden-1');
const world = generateWorld(seedKey);
const context = createMarketContext(seedKey, world, DEFAULT_MARKET_CONFIG);
const { layout, etfs, spreads } = context;
const { base, phaseFactor, closedUnderlyingFactor } = DEFAULT_MARKET_CONFIG.spreads;

function sessionMinutes(i: number): { open: number; close: number } {
  return {
    open: layout.boundaries[layout.openBoundary[i]],
    close: layout.boundaries[layout.closeBoundary[i]],
  };
}

describe('quote-logic', () => {
  describe('createSpreadLayout', () => {
    it('keeps the base spread inside the range of the size class, tighter for larger values', () => {
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
      const { open } = sessionMinutes(0);
      expect(marketSpread(context, 0, 'normal', open + 10)).toBe(spreads.stockBase[0]);
    });

    it('widens with the market phase and when the exchange is closed', () => {
      const { open, close } = sessionMinutes(0);
      for (const phase of MARKET_PHASES) {
        expect(marketSpread(context, 0, phase, open)).toBeCloseTo(
          spreads.stockBase[0] * phaseFactor[phase],
          15,
        );
      }
      expect(marketSpread(context, 0, 'crisis', open) / spreads.stockBase[0]).toBeCloseTo(2.5, 12);
      expect(marketSpread(context, 0, 'normal', close)).toBeCloseTo(
        spreads.stockBase[0] * closedUnderlyingFactor,
        15,
      );
    });

    it('widens the spread of ETFs by the closed share of the underlying', () => {
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
    it('keeps bid below ask on the price grid at every price, also below 10 € and 1 €', () => {
      const spread = base.large[0];
      for (let mid = 0.05; mid < 800; mid *= 1.003) {
        const { bid, ask } = quote(mid, spread);
        const step = priceStep(mid);
        expect(bid).toBeLessThan(ask);
        expect(ask - bid).toBeGreaterThanOrEqual(step * (1 - 1e-9));
        expect(bid).toBeLessThanOrEqual(mid);
        expect(ask).toBeGreaterThanOrEqual(mid);
        expect(Math.abs(Math.round(bid / step) * step - bid)).toBeLessThan(1e-9);
      }
    });

    it('keeps the spread inside the configured frame for prices above a few euros', () => {
      const maxSpread =
        base.small[1] * Math.max(...Object.values(phaseFactor)) * closedUnderlyingFactor + 0.002;
      for (let mid = 20; mid < 800; mid *= 1.01) {
        const { bid, ask } = quote(mid, maxSpread);
        expect((ask - bid) / mid).toBeLessThan(maxSpread + 2 * (priceStep(mid) / mid));
      }
    });
  });

  describe('PriceSource.quoteAt', () => {
    const endOfJanuary = dayIndex(dateTimeToTick({ year: 2020, month: 2, day: 1 }));
    const history = createFactorHistory();
    const state = createMarketState(context);
    advanceMarket(context, state, endOfJanuary, { history });
    const source = new PriceSource(context, history, state);
    const now = dayStartTick(endOfJanuary) - 1;

    it('quotes around the price with the market spread plus the venue mark-up', () => {
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
      const saturday = dayIndex(dateTimeToTick({ year: 2020, month: 1, day: 25 }));
      const tick = dayStartTick(saturday) + 600;
      const result = source.quoteAt(0, tick, now, 0);
      expect(result.mid).toBe(source.priceAt(0, tick, now));
      expect(result.spread / spreads.stockBase[0]).toBeGreaterThanOrEqual(closedUnderlyingFactor);
    });
  });
});
