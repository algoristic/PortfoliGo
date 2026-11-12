import { deriveSeedKey } from '@app/simulation/util/seed';

import { generateWorld } from './world-generator';

import { BUDGETS_MS, expectWithinBudget, medianMs } from '../../../testing/perf';

// Budget of TS §14.3 (AP 1.3); the perf suite runs one file after the other.

describe('world performance', () => {
  it('generates the standard world within the budget', () => {
    const seedKey = deriveSeedKey('perf-world');
    const ms = medianMs(() => generateWorld(seedKey), 5);
    expectWithinBudget('world generation', ms, BUDGETS_MS.worldGeneration);
  });
});
