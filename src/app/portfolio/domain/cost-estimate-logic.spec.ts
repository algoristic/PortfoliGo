import fc from 'fast-check';

import { dailyTerCost, spreadCost } from './cost-estimate-logic';

const SHARE = 1_000_000;

describe('cost-estimate-logic', () => {
  describe('spreadCost', () => {
    // TS §7.4: estimated spread costs of an execution
    it.each<[string, 'buy' | 'sell', number, number, number, number]>([
      ['a purchase of 10 shares at the ask', 'buy', 10 * SHARE, 100.05, 100, 50],
      ['a sale of 2.5 shares at the bid', 'sell', 2_500_000, 39.98, 40, 5],
      ['a fractional savings plan purchase', 'buy', 410_416, 120, 119.88, 5],
      ['a half cent, rounded away from zero', 'buy', SHARE, 10.005, 10, 1],
      ['a purchase below the mid', 'buy', SHARE, 9.99, 10, 0],
      ['a sale above the mid', 'sell', SHARE, 10.01, 10, 0],
    ])('estimates %s', (_case, side, quantity, price, mid, expected) => {
      expect(spreadCost(side, quantity, price, mid)).toBe(expected);
    });

    it('is a whole, non-negative number of cents', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<'buy' | 'sell'>('buy', 'sell'),
          fc.integer({ min: 1, max: 10_000 * SHARE }),
          fc.integer({ min: 1, max: 10_000_000 }),
          fc.integer({ min: -1_000, max: 1_000 }),
          (side, quantity, midSteps, distance) => {
            const mid = midSteps / 10_000;
            const cost = spreadCost(side, quantity, mid + distance / 10_000, mid);
            expect(Number.isInteger(cost)).toBe(true);
            expect(cost).toBeGreaterThanOrEqual(0);
          },
        ),
      );
    });
  });

  describe('dailyTerCost', () => {
    // TS §7.4: estimated TER costs of a day, value × TER ÷ 365
    it.each<[string, number, number, number]>([
      ['10,000 € at 0.20 %', 1_000_000, 0.002, 2_000 / 365],
      ['36,500 € at 0.07 %', 3_650_000, 0.0007, 7],
      ['a value of 0', 0, 0.002, 0],
    ])('estimates %s', (_case, value, ter, expected) => {
      expect(dailyTerCost(value, ter)).toBeCloseTo(expected, 9);
    });

    it('adds up to the yearly TER over 365 days', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1e9 }),
          fc.double({ min: 0.0005, max: 0.0065, noNaN: true }),
          (value, ter) => {
            expect(365 * dailyTerCost(value, ter)).toBeCloseTo(value * ter, 3);
          },
        ),
      );
    });
  });
});
