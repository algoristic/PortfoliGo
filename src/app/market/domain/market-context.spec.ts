import { MINUTES_PER_DAY } from '@app/clock/domain/models/time.model';
import { deriveSeedKey } from '@app/simulation/util/seed';
import { World } from '@app/world/domain/models/world.model';
import { generateWorld } from '@app/world/domain/world-generator';

import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { GOLDEN_SEED } from './golden-master';
import { isMarketDay } from './market-calendar';
import { activityIntervalYears, createMarketContext, factorPathAt } from './market-context';
import { createMarketLayout, MarketLayout, WORLD_FACTOR } from './market-layout';

const DAY_YEARS = 1 / DEFAULT_MARKET_CONFIG.tradingDaysPerYear;

let world: World;
let layout: MarketLayout;

beforeAll(() => {
  world = generateWorld(deriveSeedKey(GOLDEN_SEED));
  layout = createMarketLayout(world);
});

/** Activity weight of the exchanges that trade during interval j. */
function openWeight(j: number): number {
  return world.exchanges
    .filter(
      (exchange) =>
        exchange.open <= layout.boundaries[j] && exchange.close >= layout.boundaries[j + 1],
    )
    .reduce((sum, exchange) => sum + (DEFAULT_MARKET_CONFIG.exchangeActivity[exchange.id] ?? 0), 0);
}

describe('activityIntervalYears', () => {
  it('splits one trading day into positive interval shares', () => {
    const years = activityIntervalYears(world, layout, DEFAULT_MARKET_CONFIG, DAY_YEARS);
    expect(years.length).toBe(layout.boundaries.length - 1);
    expect(years.every((value) => value > 0)).toBe(true);
    expect(years.reduce((sum, value) => sum + value, 0)).toBeCloseTo(DAY_YEARS, 15);
  });

  it('gives the plain interval lengths when the factors are as active while exchanges are closed', () => {
    const config = { ...DEFAULT_MARKET_CONFIG, closedActivity: 1 };
    const years = activityIntervalYears(world, layout, config, DAY_YEARS);
    years.forEach((value, j) => {
      const minutes = layout.boundaries[j + 1] - layout.boundaries[j];
      expect(value).toBeCloseTo((DAY_YEARS * minutes) / MINUTES_PER_DAY, 15);
    });
  });

  it('gives a minute more variance the more exchange weight is open', () => {
    const years = activityIntervalYears(world, layout, DEFAULT_MARKET_CONFIG, DAY_YEARS);
    const perMinute = Array.from(
      years,
      (value, j) => value / (layout.boundaries[j + 1] - layout.boundaries[j]),
    );
    for (let a = 0; a < perMinute.length; a++) {
      for (let b = 0; b < perMinute.length; b++) {
        if (openWeight(a) > openWeight(b) + 1e-12) {
          expect(perMinute[a]).toBeGreaterThan(perMinute[b]);
        }
      }
    }
  });

  it('moves less factor variance outside the sessions, weighted by exchange activity', () => {
    // Exchanges far from the busiest hours (Asia-Pacific) may see more; the average sees less.
    const even = activityIntervalYears(
      world,
      layout,
      { ...DEFAULT_MARKET_CONFIG, closedActivity: 1 },
      DAY_YEARS,
    );
    const weighted = activityIntervalYears(world, layout, DEFAULT_MARKET_CONFIG, DAY_YEARS);
    const outsideShare = (years: Float64Array): number =>
      world.exchanges.reduce((sum, exchange) => {
        const activity = DEFAULT_MARKET_CONFIG.exchangeActivity[exchange.id] ?? 0;
        const outside = years.reduce(
          (total, value, j) =>
            layout.boundaries[j] >= exchange.open && layout.boundaries[j + 1] <= exchange.close
              ? total
              : total + value,
          0,
        );
        return sum + activity * outside;
      }, 0);
    expect(outsideShare(weighted)).toBeLessThan(0.95 * outsideShare(even));
  });

  it('ignores the companies of the world', () => {
    const fewer = { ...world, companies: world.companies.slice(0, 10) };
    expect(activityIntervalYears(fewer, layout, DEFAULT_MARKET_CONFIG, DAY_YEARS)).toEqual(
      activityIntervalYears(world, layout, DEFAULT_MARKET_CONFIG, DAY_YEARS),
    );
  });
});

describe('factorPathAt', () => {
  it('leaves the world factor free and gives the other factors the path m̄·t − ½·s̄²·g(t)', () => {
    const context = createMarketContext(deriveSeedKey(GOLDEN_SEED), world, DEFAULT_MARKET_CONFIG);
    // 2030-01-01 is day 3653; count the market days before it independently.
    let marketDays = 0;
    for (let day = 0; day < 3653; day++) {
      if (isMarketDay(day)) {
        marketDays++;
      }
    }
    const years = marketDays * DAY_YEARS;
    const path = factorPathAt(context, 3653);
    expect(path.target[WORLD_FACTOR]).toBe(0);
    expect(path.convexity[WORLD_FACTOR]).toBe(1);
    const { levelReversion, trendTarget, volTarget } = DEFAULT_MARKET_CONFIG.factors.industry;
    const g = (t: number): number => (1 - Math.exp(-2 * levelReversion * t)) / (2 * levelReversion);
    const industry = layout.factorKinds.indexOf('industry');
    expect(path.target[industry]).toBeCloseTo(
      trendTarget * years - 0.5 * volTarget * volTarget * g(years),
      12,
    );
    expect(path.convexity[industry]).toBeCloseTo((g(years + DAY_YEARS) - g(years)) / DAY_YEARS, 9);
    expect(path.convexity[industry]).toBeLessThan(1);
  });
});
