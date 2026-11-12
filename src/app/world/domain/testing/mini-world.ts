import { deriveSeedKey, SeedKey } from '@app/simulation/util/seed';

import { DEFAULT_WORLD_CONFIG } from '../default-world-config';
import { WorldConfig } from '../models/world-config.model';
import { World } from '../models/world.model';
import { generateWorld } from '../world-generator';

/**
 * A small world for property tests that need many runs (TS §14.1): fewer companies, smaller
 * indices and four ETF products. The world-ETF products guarantee an accumulating and a
 * distributing ETF on the same index for every seed. The taxonomy (and so the factors) is the same
 * as in the standard world.
 */
export const MINI_WORLD_CONFIG: WorldConfig = {
  ...DEFAULT_WORLD_CONFIG,
  companies: { ...DEFAULT_WORLD_CONFIG.companies, count: 24 },
  indices: {
    ...DEFAULT_WORLD_CONFIG.indices,
    leadingSize: { 'north-america': 5, europe: 4, 'asia-pacific': 3, 'emerging-markets': 2 },
    dividendSize: 6,
  },
  etfs: {
    ...DEFAULT_WORLD_CONFIG.etfs,
    products: [
      { kind: 'world', count: 2, ter: [0.0012, 0.0025], distributingShare: 0 },
      { kind: 'world', count: 1, ter: [0.0012, 0.0025], distributingShare: 1 },
      {
        kind: 'region-broad',
        regionId: 'europe',
        count: 1,
        ter: [0.001, 0.002],
        distributingShare: 0.5,
      },
      { kind: 'dividend', count: 1, ter: [0.003, 0.0065], distributingShare: 1 },
    ],
  },
};

export interface MiniWorld {
  seedKey: SeedKey;
  world: World;
}

/** The mini world of a seed; throws if the seed misses a feature that the tests rely on. */
export function miniWorld(seed = 'mini-1'): MiniWorld {
  const seedKey = deriveSeedKey(seed);
  const world = generateWorld(seedKey, MINI_WORLD_CONFIG);
  if (!world.companies.some((company) => company.dividend.yield > 0)) {
    throw new Error(`mini world ${seed} has no dividend payer`);
  }
  const hasPair = world.etfs.some(
    (accumulating) =>
      accumulating.distribution.kind === 'accumulating' &&
      world.etfs.some(
        (distributing) =>
          distributing.distribution.kind === 'distributing' &&
          distributing.indexId === accumulating.indexId,
      ),
  );
  if (!hasPair) {
    throw new Error(`mini world ${seed} has no accumulating and distributing ETF on one index`);
  }
  return { seedKey, world };
}
