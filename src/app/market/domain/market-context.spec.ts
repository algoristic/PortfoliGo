import { MINUTES_PER_DAY } from '@app/clock/domain/models/time.model';
import { deriveSeedKey } from '@app/simulation/util/seed';
import { RegionId } from '@app/world/domain/models/taxonomy.model';
import { World } from '@app/world/domain/models/world.model';
import { generateWorld } from '@app/world/domain/world-generator';

import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { GOLDEN_SEED } from './golden-master';
import { isMarketDay } from './market-calendar';
import { activityIntervalYears, createMarketContext, factorPathAt } from './market-context';
import { createMarketLayout, factorId, MarketLayout, WORLD_FACTOR } from './market-layout';
import { MarketConfig } from './models/market-config.model';

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

// TS §6.2 (E-30): share of a region factor's daily variance inside a session of its region for
// `c_R = 0.1` and equal exchange weights. Within a region all exchanges share their hours, except
// India and Brazil, whose sessions each carry half the region's weight: a = 0.1 + 0.9 · 0.5.
const REGION_SESSIONS: readonly { regionId: RegionId; session: [number, number]; share: number }[] =
  [
    { regionId: 'north-america', session: [930, 1320], share: 390 / 495 },
    { regionId: 'europe', session: [540, 1050], share: 510 / 603 },
    { regionId: 'asia-pacific', session: [60, 420], share: 360 / 468 },
    { regionId: 'emerging-markets', session: [285, 660], share: 206.25 / 501.75 },
    { regionId: 'emerging-markets', session: [840, 1260], share: 231 / 501.75 },
  ];

function regionTableConfig(): MarketConfig {
  return {
    ...DEFAULT_MARKET_CONFIG,
    regionClosedActivity: 0.1,
    exchangeActivity: Object.fromEntries(world.exchanges.map((exchange) => [exchange.id, 1])),
  };
}

/** Share of the interval years `years` that falls into `[from, to)`. */
function sessionShare(years: ArrayLike<number>, [from, to]: [number, number]): number {
  let inside = 0;
  let total = 0;
  for (let j = 0; j < years.length; j++) {
    total += years[j];
    if (layout.boundaries[j] >= from && layout.boundaries[j + 1] <= to) {
      inside += years[j];
    }
  }
  return inside / total;
}

describe('activityIntervalYears of a region (E-30)', () => {
  it.each(REGION_SESSIONS)(
    'moves $share of the variance of the $regionId factor inside $session',
    ({ regionId, session, share }) => {
      const years = activityIntervalYears(world, layout, regionTableConfig(), DAY_YEARS, regionId);
      expect(years.reduce((sum, value) => sum + value, 0)).toBeCloseTo(DAY_YEARS, 15);
      expect(sessionShare(years, session)).toBeCloseTo(share, 12);
    },
  );

  it('spreads the variance evenly when the region factors are as active outside the sessions', () => {
    const config = { ...DEFAULT_MARKET_CONFIG, regionClosedActivity: 1 };
    const years = activityIntervalYears(world, layout, config, DAY_YEARS, 'europe');
    years.forEach((value, j) => {
      const minutes = layout.boundaries[j + 1] - layout.boundaries[j];
      expect(value).toBeCloseTo((DAY_YEARS * minutes) / MINUTES_PER_DAY, 15);
    });
  });

  it('gives each region factor the profile of its region and all other factors the common one', () => {
    const config = regionTableConfig();
    const context = createMarketContext(deriveSeedKey(GOLDEN_SEED), world, config);
    const intervals = layout.boundaries.length - 1;
    const profile = (k: number): Float64Array =>
      context.intervalYears.subarray(k * intervals, (k + 1) * intervals);
    for (const { regionId, session, share } of REGION_SESSIONS) {
      const k = layout.factorIds.indexOf(factorId('region', regionId));
      expect(sessionShare(profile(k), session)).toBeCloseTo(share, 12);
    }
    const common = activityIntervalYears(world, layout, config, DAY_YEARS);
    layout.factorKinds.forEach((kind, k) => {
      if (kind !== 'region') {
        expect(profile(k)).toEqual(common);
      }
    });
    expect(context.sqrtIntervalYears[intervals + 3]).toBeCloseTo(
      Math.sqrt(context.intervalYears[intervals + 3]),
      15,
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
