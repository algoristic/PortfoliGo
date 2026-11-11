import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { isMarketDay } from './market-calendar';
import { marketChecksum } from './market-checksum';
import { createMarketContext } from './market-context';
import { restoreMarket, snapshotMarket } from './market-snapshot';
import { advanceMarket, createMarketState } from './market-step';
import { MarketDay } from './models/market-day.model';
import { MarketState } from './models/market-state.model';
import { priceFromLog } from './price-logic';

import { dateTimeToTick, dayIndex } from '../../clock/domain/calendar-logic';
import { Checksum } from '../../simulation/util/checksum';
import { deriveSeedKey } from '../../simulation/util/seed';
import { World } from '../../world/domain/models/world.model';
import { generateWorld } from '../../world/domain/world-generator';

/** Changes when the prices for existing seeds change; then `simVersion` must be raised (TS §15). */
const GOLDEN_1_PRICES_2020 = '60106989e541c9562a2cb7ed6c463d85';

const seedKey = deriveSeedKey('golden-1');
const world = generateWorld(seedKey);
const context = createMarketContext(seedKey, world, DEFAULT_MARKET_CONFIG);
const endOf2020 = dayIndex(dateTimeToTick({ year: 2021, month: 1, day: 1 }));

function run(toDay: number, onDay?: (day: Readonly<MarketDay>) => void): MarketState {
  const state = createMarketState(context);
  advanceMarket(context, state, toDay, { onDay });
  return state;
}

function priceChecksum(toDay: number): string {
  const checksum = new Checksum();
  run(toDay, (day) => {
    for (let i = 0; i < day.logOpen.length; i++) {
      checksum.addFloat64(priceFromLog(day.logOpen[i], DEFAULT_MARKET_CONFIG.priceFloor));
      checksum.addFloat64(priceFromLog(day.logClose[i], DEFAULT_MARKET_CONFIG.priceFloor));
    }
  });
  return checksum.digest();
}

describe('advanceMarket', () => {
  describe('determinism', () => {
    it('matches the golden checksum over the opens and closes of the first year', () => {
      expect(priceChecksum(endOf2020)).toBe(GOLDEN_1_PRICES_2020);
    });

    it('does not depend on how the days are split into calls', () => {
      const whole = run(endOf2020);
      const dayByDay = createMarketState(context);
      for (let day = 1; day <= endOf2020; day++) {
        advanceMarket(context, dayByDay, day);
      }
      const uneven = createMarketState(context);
      for (let day = 0, step = 1; day < endOf2020; step = (step % 7) + 1) {
        day = Math.min(endOf2020, day + step);
        advanceMarket(context, uneven, day);
      }
      expect(marketChecksum(dayByDay)).toBe(marketChecksum(whole));
      expect(marketChecksum(uneven)).toBe(marketChecksum(whole));
    });

    it('continues identically after snapshot and restore', () => {
      const original = run(150);
      const snapshot = snapshotMarket(original);
      const snapshotChecksum = marketChecksum(snapshot);
      advanceMarket(context, original, endOf2020);
      const restored = restoreMarket(snapshot);
      advanceMarket(context, restored, endOf2020);
      expect(marketChecksum(restored)).toBe(marketChecksum(original));
      expect(marketChecksum(snapshot)).toBe(snapshotChecksum);
    });

    it('keeps the prices of the other instruments when an instrument is added', () => {
      const extended: World = {
        ...world,
        companies: [...world.companies, { ...world.companies[0], id: 'cmp-extra' }],
      };
      const extendedContext = createMarketContext(seedKey, extended, DEFAULT_MARKET_CONFIG);
      const closes: number[] = [];
      run(60, (day) => closes.push(...day.logClose));
      const extendedState = createMarketState(extendedContext);
      const extendedCloses: number[] = [];
      advanceMarket(extendedContext, extendedState, 60, {
        onDay: (day) => extendedCloses.push(...day.logClose.subarray(0, world.companies.length)),
      });
      expect(extendedCloses).toEqual(closes);
    });

    it('creates different prices for different seeds', () => {
      const otherKey = deriveSeedKey('golden-2');
      const other = createMarketContext(otherKey, generateWorld(otherKey), DEFAULT_MARKET_CONFIG);
      const state = createMarketState(other);
      advanceMarket(other, state, 30);
      expect(marketChecksum(state)).not.toBe(marketChecksum(run(30)));
    });
  });

  describe('calendar', () => {
    it('steps only on weekdays and leaves the factors unchanged over the weekend', () => {
      // 03.01.2020 is a Friday (day 2), 06.01.2020 a Monday (day 5).
      const steppedDays: number[] = [];
      const levels = new Map<number, Float64Array>();
      run(6, (day) => {
        steppedDays.push(day.day);
        levels.set(day.day, day.factorLevels.slice());
      });
      expect(steppedDays).toEqual([0, 1, 2, 5]);
      expect(steppedDays.every(isMarketDay)).toBe(true);
      expect(marketChecksum({ ...run(5), day: 0 })).toBe(marketChecksum({ ...run(3), day: 0 }));

      const boundaryCount = context.layout.boundaries.length;
      const friday = levels.get(2) as Float64Array;
      const monday = levels.get(5) as Float64Array;
      for (let k = 0; k < context.layout.factorIds.length; k++) {
        expect(monday[k * boundaryCount]).toBe(friday[(k + 1) * boundaryCount - 1]);
      }
    });
  });

  describe('instruments', () => {
    it('places the jumps inside the session in ascending order', () => {
      const { layout } = context;
      let jumps = 0;
      let marketDays = 0;
      run(endOf2020 * 3, (day) => {
        marketDays++;
        for (let i = 0; i < layout.instrumentIds.length; i++) {
          const open = layout.boundaries[layout.openBoundary[i]];
          const close = layout.boundaries[layout.closeBoundary[i]];
          let previous = open;
          for (let n = 0; n < day.jumpCount[i]; n++) {
            const minute = day.jumpMinute[day.jumpStart[i] + n];
            expect(minute).toBeGreaterThan(open);
            expect(minute).toBeLessThanOrEqual(close);
            expect(minute).toBeGreaterThanOrEqual(previous);
            previous = minute;
          }
          jumps += day.jumpCount[i];
        }
      });
      const expected = layout.jumpIntensity.reduce(
        (sum, lambda) => sum + (lambda * marketDays) / DEFAULT_MARKET_CONFIG.tradingDaysPerYear,
        0,
      );
      expect(Math.abs(jumps - expected) / expected).toBeLessThan(0.1);
    });

    it('starts at the start price and moves with the factors and the idiosyncratic part', () => {
      const firstDay: number[] = [];
      run(1, (day) => firstDay.push(...day.logOpen));
      world.companies.forEach((company, i) => {
        // On the first open, only the overnight shock and factor moves since 00:00 apply.
        expect(Math.abs(firstDay[i] - Math.log(company.startPrice))).toBeLessThan(0.1);
      });
    });
  });
});
