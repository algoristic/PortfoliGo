import fc from 'fast-check';

import { averageCost, lotCostShare, lotTotals, sellLots } from './lot-logic';
import { Lot } from './models/lot.model';

const SHARE = 1_000_000;

describe('lot-logic', () => {
  describe('lotCostShare', () => {
    // TS §7.6: round(cost × sold / quantity), halves away from zero
    it.each([
      [100_000, 1 * SHARE, 3 * SHARE, 33_333],
      [66_667, 1 * SHARE, 2 * SHARE, 33_334],
      [1_001, 250_000, 500_000, 501],
      [101_300, 4 * SHARE, 10 * SHARE, 40_520],
      [5, 1, 3, 2],
      [4, 1, 3, 1],
      [-5, 1, 2, -3],
      [0, SHARE, 2 * SHARE, 0],
      [52_000, 5 * SHARE, 5 * SHARE, 52_000],
      // beyond exact doubles: (2⁵³ − 1) × 2 / 3 = 6.004.799.503.160.660,67
      [Number.MAX_SAFE_INTEGER, 2, 3, 6_004_799_503_160_661],
    ])('takes %d × %d / %d → %d', (cost, sold, quantity, expected) => {
      expect(lotCostShare(cost, sold, quantity)).toBe(expected);
    });

    it.each([0, -1, 0.5])('throws for a lot of %d millionths', (quantity) => {
      expect(() => lotCostShare(100, 1, quantity)).toThrow(RangeError);
    });
  });

  describe('sellLots', () => {
    // TS §7.6, „Teilverkäufe“: lots of 10 shares for 1.013,00 € and 5 for 520,00 €
    const lots: readonly Lot[] = [
      { buyTick: 1, quantity: 10 * SHARE, cost: 101_300 },
      { buyTick: 2, quantity: 5 * SHARE, cost: 52_000 },
    ];

    it('sells the oldest lot first and keeps the rest of a partly sold lot', () => {
      const first = sellLots(lots, 4 * SHARE);
      expect(first).toEqual({
        cost: 40_520,
        lots: [
          { buyTick: 1, quantity: 6 * SHARE, cost: 60_780 },
          { buyTick: 2, quantity: 5 * SHARE, cost: 52_000 },
        ],
      });
      const second = sellLots(first.lots, 8 * SHARE);
      expect(second).toEqual({
        cost: 81_580,
        lots: [{ buyTick: 2, quantity: 3 * SHARE, cost: 31_200 }],
      });
      const third = sellLots(second.lots, 3 * SHARE);
      expect(third).toEqual({ cost: 31_200, lots: [] });
      expect(first.cost + second.cost + third.cost).toBe(153_300);
    });

    it('sells a whole lot exactly at its boundary', () => {
      expect(sellLots(lots, 10 * SHARE)).toEqual({ cost: 101_300, lots: [lots[1]] });
    });

    // TS §7.6: three shares for 1.000,00 € sold one by one: 333,33 + 333,34 + 333,33
    it('sums the rounded shares of one lot to its cost', () => {
      let rest: Lot[] = [{ buyTick: 1, quantity: 3 * SHARE, cost: 100_000 }];
      const costs: number[] = [];
      for (let n = 0; n < 3; n++) {
        const sale = sellLots(rest, SHARE);
        costs.push(sale.cost);
        rest = sale.lots;
      }
      expect(costs).toEqual([33_333, 33_334, 33_333]);
    });

    it('leaves the lots it was given unchanged', () => {
      const copy = lots.map((lot) => ({ ...lot }));
      sellLots(lots, 12 * SHARE);
      expect(lots).toEqual(copy);
    });

    it.each([16 * SHARE, 0, -1, 0.5])('throws for %d millionths', (quantity) => {
      expect(() => sellLots(lots, quantity)).toThrow(RangeError);
    });

    it('adds up the costs of any sequence of sales to the costs of the lots', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              quantity: fc.integer({ min: 1, max: 20 * SHARE }),
              cost: fc.integer({ min: 0, max: 50_000_000 }),
            }),
            { minLength: 1, maxLength: 6 },
          ),
          fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 12 }),
          (bought, parts) => {
            let rest: Lot[] = bought.map((lot, buyTick) => ({ ...lot, buyTick }));
            const total = lotTotals(rest);
            let sold = 0;
            for (const part of parts) {
              const { quantity } = lotTotals(rest);
              if (quantity === 0) {
                break;
              }
              const sale = sellLots(rest, Math.max(1, Math.floor((quantity * part) / 100)));
              sold += sale.cost;
              rest = sale.lots;
              expect(sold + lotTotals(rest).cost).toBe(total.cost);
              expect(rest.every((lot) => lot.quantity > 0)).toBe(true);
            }
            const last = lotTotals(rest);
            if (last.quantity > 0) {
              expect(sold + sellLots(rest, last.quantity).cost).toBe(total.cost);
            }
          },
        ),
      );
    });
  });

  describe('averageCost', () => {
    // TS §7.6: cost of the lots ÷ shares, in euros per share
    it.each<[Lot[], number | null]>([
      [[{ buyTick: 1, quantity: 10 * SHARE, cost: 101_300 }], 101.3],
      [
        [
          { buyTick: 1, quantity: 6 * SHARE, cost: 60_780 },
          { buyTick: 2, quantity: 5 * SHARE, cost: 52_000 },
        ],
        1_127.8 / 11,
      ],
      [[{ buyTick: 1, quantity: 500_000, cost: 1_001 }], 20.02],
      [[], null],
    ])('of %j is %d', (lots, expected) => {
      const value = averageCost(lots);
      if (expected === null) {
        expect(value).toBeNull();
      } else {
        expect(value).toBeCloseTo(expected, 10);
      }
    });
  });
});
