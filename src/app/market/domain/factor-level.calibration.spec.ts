import { variance } from '@app/analysis/domain/statistics-logic';
import { deriveSeedKey } from '@app/simulation/util/seed';
import { RegionId } from '@app/world/domain/models/taxonomy.model';
import { generateWorld } from '@app/world/domain/world-generator';

import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { isMarketDay } from './market-calendar';
import { createMarketContext } from './market-context';
import { factorId } from './market-layout';
import { createMarketDay, createMarketState, stepFactorDay } from './market-step';
import { FactorKind, MarketConfig } from './models/market-config.model';

import { TEST_SEEDS } from '../../../testing/seeds';
import { expectWithinSigma } from '../../../testing/statistics';

// Return of the factor levels to their expected path (TS §6.2, E-22): the levels of the industry
// factors drift apart much less than without the return, while the world factor stays free.
// Activity of the region factors (TS §6.2, E-30): they move mostly in the sessions of their region.

const YEARS = 60;

/** Levels of the factors by kind after `YEARS` years of factor day steps, over the seeds. */
function levelsAfter(config: MarketConfig): Map<FactorKind, number[]> {
  const levels = new Map<FactorKind, number[]>();
  for (const seed of TEST_SEEDS.calibration) {
    const seedKey = deriveSeedKey(seed);
    const context = createMarketContext(seedKey, generateWorld(seedKey), config);
    const state = createMarketState(context);
    const out = createMarketDay(context);
    let marketDays = 0;
    for (let day = 0; marketDays < YEARS * config.tradingDaysPerYear; day++) {
      if (isMarketDay(day)) {
        stepFactorDay(context, state, day, out);
        marketDays++;
      }
    }
    context.layout.factorKinds.forEach((kind, k) => {
      levels.set(kind, [...(levels.get(kind) ?? []), state.level[k]]);
    });
  }
  return levels;
}

describe('factor levels', () => {
  const free: MarketConfig = {
    ...DEFAULT_MARKET_CONFIG,
    factors: {
      ...DEFAULT_MARKET_CONFIG.factors,
      industry: { ...DEFAULT_MARKET_CONFIG.factors.industry, levelReversion: 0 },
    },
  };

  let reverting: Map<FactorKind, number[]>;
  let drifting: Map<FactorKind, number[]>;

  beforeAll(() => {
    reverting = levelsAfter(DEFAULT_MARKET_CONFIG);
    drifting = levelsAfter(free);
  });

  it('keeps the industries much closer together than without the return', () => {
    // Without return the variance grows with t (about 0.6 after 60 years), with it it stays
    // near its stationary value (about 0.07 for a half-life of 10 years).
    expect(variance(reverting.get('industry') ?? [])).toBeLessThan(
      0.3 * variance(drifting.get('industry') ?? []),
    );
  });

  it('leaves the world factor unchanged', () => {
    expect(reverting.get('world')).toHaveLength(TEST_SEEDS.calibration.length);
    expect(reverting.get('world')).toEqual(drifting.get('world'));
  });
});

describe('activity of the region factors', () => {
  // TS §6.2: shares of the daily variance inside a session of the region for c_R = 0.1 and equal
  // exchange weights.
  const sessions: readonly { regionId: RegionId; from: number; to: number; share: number }[] = [
    { regionId: 'north-america', from: 930, to: 1320, share: 390 / 495 },
    { regionId: 'europe', from: 540, to: 1050, share: 510 / 603 },
    { regionId: 'asia-pacific', from: 60, to: 420, share: 360 / 468 },
    { regionId: 'emerging-markets', from: 285, to: 660, share: 206.25 / 501.75 },
  ];
  const marketDays = 10_000;
  /** Session moves of each region factor, standardised by its volatility of the day and √Δ_T. */
  let moves: Map<RegionId, number[]>;

  beforeAll(() => {
    const seedKey = deriveSeedKey(TEST_SEEDS.calibration[0]);
    const world = generateWorld(seedKey);
    const config: MarketConfig = {
      ...DEFAULT_MARKET_CONFIG,
      regionClosedActivity: 0.1,
      exchangeActivity: Object.fromEntries(world.exchanges.map((exchange) => [exchange.id, 1])),
    };
    const context = createMarketContext(seedKey, world, config);
    const { boundaries, factorIds } = context.layout;
    const boundaryCount = boundaries.length;
    const state = createMarketState(context);
    const out = createMarketDay(context);
    moves = new Map(sessions.map(({ regionId }) => [regionId, []]));
    let stepped = 0;
    for (let day = 0; stepped < marketDays; day++) {
      if (!isMarketDay(day)) {
        continue;
      }
      stepFactorDay(context, state, day, out);
      stepped++;
      for (const { regionId, from, to } of sessions) {
        const k = factorIds.indexOf(factorId('region', regionId));
        const move =
          out.factorLevels[k * boundaryCount + boundaries.indexOf(to)] -
          out.factorLevels[k * boundaryCount + boundaries.indexOf(from)];
        moves.get(regionId)?.push(move / (out.factorVols[k] * Math.sqrt(context.dayYears)));
      }
    }
  });

  it.each(sessions)(
    'moves the $regionId factor by the share $share of its daily variance in the session',
    ({ regionId, share }) => {
      // The standardised move is normal with variance `share`; its sample variance has the
      // standard error share · √(2 / (n − 1)).
      const values = moves.get(regionId) ?? [];
      expectWithinSigma(
        variance(values),
        share,
        share * Math.sqrt(2 / (values.length - 1)),
        4,
        regionId,
      );
    },
  );
});
