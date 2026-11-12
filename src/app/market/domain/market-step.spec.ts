import { deriveSeedKey } from '@app/simulation/util/seed';

import { generateWorld } from '@app/world/domain/world-generator';

import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { isMarketDay } from './market-calendar';
import { marketChecksum } from './market-checksum';
import { createMarketContext, MarketContext } from './market-context';
import { restoreMarket, snapshotMarket } from './market-snapshot';
import { advanceMarket, createMarketState } from './market-step';
import { MarketDay } from './models/market-day.model';
import { MarketState } from './models/market-state.model';
import { END_OF_2020_DAY, GoldenYear, goldenYear } from './testing/golden-year';

import { expectWithinSigma, poissonSe } from '../../../testing/statistics';

// Arbitrary splits, snapshots and added instruments are properties in `market-properties.spec.ts`;
// the golden checksums live in `golden-master.spec.ts`. Here: one golden example each, and the
// rules of the day step.

describe('advanceMarket', () => {
  let golden: GoldenYear;
  let context: MarketContext;

  function run(toDay: number, onDay?: (day: Readonly<MarketDay>) => void): MarketState {
    const state = createMarketState(context);
    advanceMarket(context, state, toDay, { onDay });
    return state;
  }

  beforeAll(() => {
    golden = goldenYear();
    context = golden.context;
  });

  describe('determinism', () => {
    it('reaches the golden state of 2020 day by day and in uneven calls', () => {
      const dayByDay = createMarketState(context);
      for (let day = 1; day <= END_OF_2020_DAY; day++) {
        advanceMarket(context, dayByDay, day);
      }
      const uneven = createMarketState(context);
      for (let day = 0, step = 1; day < END_OF_2020_DAY; step = (step % 7) + 1) {
        day = Math.min(END_OF_2020_DAY, day + step);
        advanceMarket(context, uneven, day);
      }
      expect(marketChecksum(dayByDay)).toBe(marketChecksum(golden.state));
      expect(marketChecksum(uneven)).toBe(marketChecksum(golden.state));
    });

    it('reaches the golden state of 2020 after a snapshot and restore', () => {
      const snapshot = snapshotMarket(run(150));
      const restored = restoreMarket(snapshot);
      advanceMarket(context, restored, END_OF_2020_DAY);
      expect(marketChecksum(restored)).toBe(marketChecksum(golden.state));
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
    it('places the jumps inside the session in ascending order at the configured rate', () => {
      const { layout } = context;
      let jumps = 0;
      let marketDays = 0;
      run(END_OF_2020_DAY * 3, (day) => {
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
      // Jumps are Poisson with rate λ_i per year of trading days (TS §6.4).
      const perDay = layout.jumpIntensity.reduce(
        (sum, lambda) => sum + lambda / DEFAULT_MARKET_CONFIG.tradingDaysPerYear,
        0,
      );
      expectWithinSigma(
        jumps / marketDays,
        perDay,
        poissonSe(perDay, marketDays),
        5,
        'jumps per day',
      );
    });

    it('starts at the start price and moves with the factors and the idiosyncratic part', () => {
      const firstDay: number[] = [];
      run(1, (day) => firstDay.push(...day.logOpen));
      golden.world.companies.forEach((company, i) => {
        // On the first open, only the overnight shock and factor moves since 00:00 apply.
        expect(Math.abs(firstDay[i] - Math.log(company.startPrice))).toBeLessThan(0.1);
      });
    });
  });
});
