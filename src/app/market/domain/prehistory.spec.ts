import { deriveSeedKey } from '@app/simulation/util/seed';

import { generateWorld } from '@app/world/domain/world-generator';

import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { runPrehistory } from './prehistory';

describe('runPrehistory', () => {
  it('runs ten years of the standard world within the CI bound', () => {
    const seedKey = deriveSeedKey('golden-1');
    const world = generateWorld(seedKey);
    const start = performance.now();
    const { state } = runPrehistory(seedKey, world, DEFAULT_MARKET_CONFIG);
    const duration = performance.now() - start;
    console.info(`prehistory: ${duration.toFixed(0)} ms for ${state.day} days`);
    // Coarse guard under parallel test workers; the budget of 0.5 s is measured in isolation.
    expect(duration).toBeLessThan(3000);
  });
});
