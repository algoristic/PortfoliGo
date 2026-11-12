import { variance } from '@app/analysis/domain/statistics-logic';
import { deriveSeedKey } from '@app/simulation/util/seed';
import { generateWorld } from '@app/world/domain/world-generator';

import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { isMarketDay } from './market-calendar';
import { createMarketContext } from './market-context';
import { createMarketDay, createMarketState, stepFactorDay } from './market-step';
import { FactorKind, MarketConfig } from './models/market-config.model';

import { TEST_SEEDS } from '../../../testing/seeds';

// Return of the factor levels to their expected path (TS §6.2, E-22): the levels of the industry
// factors drift apart much less than without the return, while the world factor stays free.

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
