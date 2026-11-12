import fc from 'fast-check';

import { deriveSeedKey } from '@app/simulation/util/seed';
import { World } from '@app/world/domain/models/world.model';
import { miniWorld } from '@app/world/domain/testing/mini-world';
import { generateWorld } from '@app/world/domain/world-generator';

import { cappingFactors, createIndexLayout } from './index-layout';
import { createMarketLayout } from './market-layout';

function cappedWeights(marketCaps: number[], cap: number | null): number[] {
  const factors = cappingFactors(marketCaps, cap);
  const values = marketCaps.map((value, n) => value * factors[n]);
  const total = values.reduce((sum, value) => sum + value, 0);
  return values.map((value) => value / total);
}

const EPSILON = 1e-9;

const arbMarketCaps = fc.array(fc.double({ min: 1, max: 1e6, noNaN: true }), {
  minLength: 1,
  maxLength: 30,
});
const arbCap = fc.double({ min: 0.02, max: 0.6, noNaN: true });

describe('createIndexLayout', () => {
  describe('cappingFactors', () => {
    it('leaves the weights without a cap or below it', () => {
      expect(cappingFactors([5, 3, 2], null)).toEqual([1, 1, 1]);
      expect(cappingFactors([5, 3, 2], 0.5)).toEqual([1, 1, 1]);
    });

    it('caps large weights and spreads the excess proportionally', () => {
      // 70 of 130 is capped at 25 %; the other 75 % follow 20 : 10 : 10 : 10 : 10, which puts
      // the 20 at 25 % as well, so 50 % remain for four times 10 (12.5 % each).
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

    it('caps at the cap, keeps the proportions of the rest and the order (TS §5.5)', () => {
      fc.assert(
        fc.property(arbMarketCaps, arbCap, (marketCaps, cap) => {
          const total = marketCaps.reduce((sum, value) => sum + value, 0);
          const original = marketCaps.map((value) => value / total);
          expect(cappingFactors(marketCaps, cap)).toHaveLength(marketCaps.length);
          const weights = cappedWeights(marketCaps, cap);
          expect(Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1)).toBeLessThan(
            EPSILON,
          );
          if (original.every((weight) => weight <= cap)) {
            expect(cappingFactors(marketCaps, cap)).toEqual(marketCaps.map(() => 1));
            return;
          }
          if (marketCaps.length * cap <= 1) {
            weights.forEach((weight) => expect(weight).toBeCloseTo(1 / marketCaps.length, 9));
            return;
          }
          expect(Math.max(...weights)).toBeLessThanOrEqual(cap + EPSILON);
          // Larger constituents never get a smaller weight.
          const order = marketCaps
            .map((_value, n) => n)
            .sort((a, b) => marketCaps[a] - marketCaps[b]);
          order
            .slice(1)
            .forEach((n, k) =>
              expect(weights[n]).toBeGreaterThanOrEqual(weights[order[k]] - EPSILON),
            );
          // A constituent above the cap ends at the cap; the uncapped keep their proportions.
          original.forEach((weight, n) => {
            if (weight > cap) {
              expect(weights[n]).toBeCloseTo(cap, 9);
            }
          });
          const free = weights.map((_weight, n) => n).filter((n) => weights[n] < cap - EPSILON);
          free
            .slice(1)
            .forEach((n) =>
              expect(weights[n] / weights[free[0]]).toBeCloseTo(
                marketCaps[n] / marketCaps[free[0]],
                9,
              ),
            );
        }),
      );
    });
  });

  // Built inside each test: Stryker activates a mutant only for code that runs in the test itself.
  describe.each([
    ['the standard world', () => generateWorld(deriveSeedKey('index-layout-1'))],
    ['the mini world', () => miniWorld().world],
  ])('of %s', (_name, createWorld: () => World) => {
    let world: World;

    beforeAll(() => {
      world = createWorld();
    });

    it('lists the constituents of every index in its own block', () => {
      const layout = createMarketLayout(world);
      const indices = createIndexLayout(world, layout);
      expect(indices.ids).toEqual(world.indices.map((index) => index.id));
      expect(indices.memberStart).toHaveLength(world.indices.length + 1);
      expect(indices.memberStart[0]).toBe(0);
      world.indices.forEach((index, x) => {
        const start = indices.memberStart[x];
        expect(indices.memberStart[x + 1] - start).toBe(index.constituents.length);
        index.constituents.forEach((id, n) => {
          expect(layout.instrumentIds[indices.members[start + n]]).toBe(id);
        });
      });
      expect(indices.memberStart[world.indices.length]).toBe(indices.members.length);
    });

    it('starts every index at its base value and caps its weights (TS §5.5)', () => {
      const layout = createMarketLayout(world);
      const indices = createIndexLayout(world, layout);
      world.indices.forEach((index, x) => {
        const values: number[] = [];
        for (let n = indices.memberStart[x]; n < indices.memberStart[x + 1]; n++) {
          const company = world.companies[indices.members[n]];
          expect(Number.isFinite(indices.shares[n]) && indices.shares[n] > 0).toBe(true);
          values.push(indices.shares[n] * company.startPrice);
        }
        const total = values.reduce((sum, value) => sum + value, 0);
        expect(Math.abs(total / indices.divisor[x] / index.baseValue - 1)).toBeLessThan(1e-12);
        if (index.capWeight !== null && index.capWeight * values.length > 1) {
          expect(Math.max(...values) / total).toBeLessThanOrEqual(index.capWeight + 1e-12);
        }
      });
    });

    it('trades every index from the earliest open to the latest close of its constituents', () => {
      const layout = createMarketLayout(world);
      const indices = createIndexLayout(world, layout);
      world.indices.forEach((index, x) => {
        const members = index.constituents.map((id) => layout.instrumentIds.indexOf(id));
        expect(indices.openBoundary[x]).toBe(
          Math.min(...members.map((i) => layout.openBoundary[i])),
        );
        expect(indices.closeBoundary[x]).toBe(
          Math.max(...members.map((i) => layout.closeBoundary[i])),
        );
      });
    });

    it('rejects an index with an unknown constituent', () => {
      const layout = createMarketLayout(world);
      const broken: World = {
        ...world,
        indices: [{ ...world.indices[0], constituents: ['cmp-unknown'] }],
      };
      expect(() => createIndexLayout(broken, layout)).toThrow(/cmp-unknown/);
    });
  });
});
