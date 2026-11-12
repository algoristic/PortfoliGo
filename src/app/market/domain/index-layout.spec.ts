import { deriveSeedKey } from '@app/simulation/util/seed';

import { generateWorld } from '@app/world/domain/world-generator';

import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { cappingFactors } from './index-layout';
import { createMarketContext } from './market-context';

function cappedWeights(marketCaps: number[], cap: number | null): number[] {
  const factors = cappingFactors(marketCaps, cap);
  const values = marketCaps.map((value, n) => value * factors[n]);
  const total = values.reduce((sum, value) => sum + value, 0);
  return values.map((value) => value / total);
}

describe('createIndexLayout', () => {
  describe('cappingFactors', () => {
    it('leaves the weights without a cap or below it', () => {
      expect(cappingFactors([5, 3, 2], null)).toEqual([1, 1, 1]);
      expect(cappingFactors([5, 3, 2], 0.5)).toEqual([1, 1, 1]);
    });

    it('caps large weights and spreads the excess proportionally', () => {
      const weights = cappedWeights([70, 20, 10, 10, 10, 10], 0.25);
      expect(weights[0]).toBeCloseTo(0.25, 12);
      expect(weights[1]).toBeCloseTo(0.25, 12);
      expect(weights[2]).toBeCloseTo(0.125, 12);
      expect(weights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 12);
    });

    it('caps again when the spread pushes another weight over the cap', () => {
      const weights = cappedWeights([60, 25, 5, 5, 5], 0.3);
      expect(Math.max(...weights)).toBeLessThanOrEqual(0.3 + 1e-12);
      expect(weights[1]).toBeCloseTo(0.3, 12);
    });

    it('uses equal weights when the cap cannot be met', () => {
      expect(cappedWeights([8, 1, 1], 0.25)).toEqual(
        [1 / 3, 1 / 3, 1 / 3].map((w) => expect.closeTo(w, 12)),
      );
    });
  });

  it('caps every index of the standard world and starts it at its base value', () => {
    const seedKey = deriveSeedKey('index-layout-1');
    const world = generateWorld(seedKey);
    const { indices, layout } = createMarketContext(seedKey, world, DEFAULT_MARKET_CONFIG);
    world.indices.forEach((index, x) => {
      const start = indices.memberStart[x];
      const end = indices.memberStart[x + 1];
      expect(end - start).toBe(index.constituents.length);
      const values: number[] = [];
      for (let n = start; n < end; n++) {
        const company = world.companies[indices.members[n]];
        expect(layout.instrumentIds[indices.members[n]]).toBe(index.constituents[n - start]);
        values.push(indices.shares[n] * company.startPrice);
      }
      const total = values.reduce((sum, value) => sum + value, 0);
      expect(total / indices.divisor[x]).toBeCloseTo(index.baseValue, 8);
      if (index.capWeight !== null && index.capWeight * values.length > 1) {
        expect(Math.max(...values) / total).toBeLessThanOrEqual(index.capWeight + 1e-12);
      }
      expect(indices.openBoundary[x]).toBeLessThan(indices.closeBoundary[x]);
    });
  });
});
