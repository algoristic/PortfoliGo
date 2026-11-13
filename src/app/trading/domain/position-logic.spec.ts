import fc from 'fast-check';

import { DepotId } from '@app/banking/domain/models/account.model';
import { Lot } from '@app/portfolio/domain/models/lot.model';

import { Position } from './models/position.model';
import {
  addDistribution,
  bookPurchase,
  bookSale,
  copyPosition,
  hasPositions,
  holdingOf,
  saleOf,
} from './position-logic';

const SHARE = 1_000_000;

function position(depotId: DepotId, instrumentId: string, lots: readonly Lot[]): Position {
  return {
    depotId,
    instrumentId,
    quantity: lots.reduce((sum, lot) => sum + lot.quantity, 0),
    lots: lots.map((lot) => ({ ...lot })),
    realizedGain: 0,
    distributions: 0,
  };
}

describe('position-logic', () => {
  const positions: readonly Position[] = [
    position('dep-2', 'i-1', [{ buyTick: 1, quantity: 10 * SHARE, cost: 100_000 }]),
    position('dep-2', 'i-2', [{ buyTick: 1, quantity: 1_500_000, cost: 1_500 }]),
    position('dep-5', 'i-1', [{ buyTick: 2, quantity: 3 * SHARE, cost: 30_000 }]),
  ];

  describe('holdingOf', () => {
    it.each<[DepotId, string, number]>([
      ['dep-2', 'i-1', 10 * SHARE],
      ['dep-2', 'i-2', 1_500_000],
      ['dep-5', 'i-1', 3 * SHARE],
      ['dep-5', 'i-2', 0],
      ['dep-7', 'i-1', 0],
    ])('returns the shares of %s in %s', (depotId, instrumentId, quantity) => {
      expect(holdingOf(positions, depotId, instrumentId)).toBe(quantity);
    });
  });

  describe('hasPositions', () => {
    it('tells depots with shares from empty ones', () => {
      expect(hasPositions(positions, 'dep-2')).toBe(true);
      expect(hasPositions(positions, 'dep-5')).toBe(true);
      expect(hasPositions(positions, 'dep-7')).toBe(false);
    });
  });

  describe('bookPurchase', () => {
    it('opens a position at the end and adds later lots to it', () => {
      const book: Position[] = [];
      bookPurchase(book, 'dep-2', 'i-1', { buyTick: 10, quantity: 10 * SHARE, cost: 101_300 });
      bookPurchase(book, 'dep-2', 'i-9', { buyTick: 11, quantity: 1, cost: 90 });
      bookPurchase(book, 'dep-2', 'i-1', { buyTick: 12, quantity: 5 * SHARE, cost: 52_000 });
      expect(book).toEqual([
        {
          depotId: 'dep-2',
          instrumentId: 'i-1',
          quantity: 15 * SHARE,
          lots: [
            { buyTick: 10, quantity: 10 * SHARE, cost: 101_300 },
            { buyTick: 12, quantity: 5 * SHARE, cost: 52_000 },
          ],
          realizedGain: 0,
          distributions: 0,
        },
        position('dep-2', 'i-9', [{ buyTick: 11, quantity: 1, cost: 90 }]),
      ]);
    });

    it('keeps positions of other depots apart', () => {
      const book = [position('dep-2', 'i-1', [{ buyTick: 1, quantity: SHARE, cost: 100 }])];
      bookPurchase(book, 'dep-5', 'i-1', { buyTick: 2, quantity: 2 * SHARE, cost: 200 });
      expect(holdingOf(book, 'dep-2', 'i-1')).toBe(SHARE);
      expect(holdingOf(book, 'dep-5', 'i-1')).toBe(2 * SHARE);
    });

    it.each<[string, Lot]>([
      ['no shares', { buyTick: 1, quantity: 0, cost: 100 }],
      ['half a millionth', { buyTick: 1, quantity: 0.5, cost: 100 }],
      ['half a cent', { buyTick: 1, quantity: SHARE, cost: 0.5 }],
    ])('throws and changes nothing for %s', (_case, lot) => {
      const book = [position('dep-2', 'i-1', [{ buyTick: 1, quantity: SHARE, cost: 100 }])];
      expect(() => bookPurchase(book, 'dep-2', 'i-1', lot)).toThrow(RangeError);
      expect(book).toEqual([
        position('dep-2', 'i-1', [{ buyTick: 1, quantity: SHARE, cost: 100 }]),
      ]);
    });
  });

  describe('bookSale', () => {
    // TS §7.6, example table „Teilverkäufe“: lots 10 for 1.013,00 € and 5 for 520,00 €.
    it('sells by FIFO, adds the realized gain and removes an empty position', () => {
      const book = [
        position('dep-2', 'i-1', [
          { buyTick: 1, quantity: 10 * SHARE, cost: 101_300 },
          { buyTick: 2, quantity: 5 * SHARE, cost: 52_000 },
        ]),
        position('dep-2', 'i-2', [{ buyTick: 1, quantity: SHARE, cost: 1_000 }]),
      ];
      expect(saleOf(book, 'dep-2', 'i-1', 4 * SHARE, 45_000)).toEqual({
        costBasis: 40_520,
        realizedGain: 4_480,
      });
      expect(bookSale(book, 'dep-2', 'i-1', 4 * SHARE, 45_000)).toEqual({
        costBasis: 40_520,
        realizedGain: 4_480,
      });
      expect(book[0]).toEqual({
        depotId: 'dep-2',
        instrumentId: 'i-1',
        quantity: 11 * SHARE,
        lots: [
          { buyTick: 1, quantity: 6 * SHARE, cost: 60_780 },
          { buyTick: 2, quantity: 5 * SHARE, cost: 52_000 },
        ],
        realizedGain: 4_480,
        distributions: 0,
      });
      expect(bookSale(book, 'dep-2', 'i-1', 8 * SHARE, 70_000)).toEqual({
        costBasis: 81_580,
        realizedGain: -11_580,
      });
      expect(book[0]).toMatchObject({
        quantity: 3 * SHARE,
        lots: [{ buyTick: 2, quantity: 3 * SHARE, cost: 31_200 }],
        realizedGain: 4_480 - 11_580,
      });
      expect(bookSale(book, 'dep-2', 'i-1', 3 * SHARE, 20_000)).toEqual({
        costBasis: 31_200,
        realizedGain: -11_200,
      });
      expect(book).toEqual([
        position('dep-2', 'i-2', [{ buyTick: 1, quantity: SHARE, cost: 1_000 }]),
      ]);
    });

    it.each<[string, DepotId, string, number]>([
      ['more than the holding', 'dep-2', 'i-1', 2 * SHARE + 1],
      ['an instrument without position', 'dep-2', 'i-3', 1],
      ['another depot', 'dep-5', 'i-1', 1],
      ['no shares', 'dep-2', 'i-1', 0],
    ])('throws and changes nothing for %s', (_case, depotId, instrumentId, quantity) => {
      const book = [position('dep-2', 'i-1', [{ buyTick: 1, quantity: 2 * SHARE, cost: 200 }])];
      expect(() => saleOf(book, depotId, instrumentId, quantity, 100)).toThrow(RangeError);
      expect(() => bookSale(book, depotId, instrumentId, quantity, 100)).toThrow(RangeError);
      expect(book).toEqual([
        position('dep-2', 'i-1', [{ buyTick: 1, quantity: 2 * SHARE, cost: 200 }]),
      ]);
    });

    it('keeps the holding equal to the sum of the unit postings and the lots', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              depot: fc.constantFrom<DepotId>('dep-2', 'dep-5'),
              instrument: fc.constantFrom('i-1', 'i-2'),
              quantity: fc.integer({ min: 1, max: 5 * SHARE }),
              cost: fc.integer({ min: 0, max: 10_000_000 }),
              sell: fc.boolean(),
            }),
            { maxLength: 30 },
          ),
          (drafts) => {
            const book: Position[] = [];
            const sums = new Map<string, number>();
            for (const [tick, { depot, instrument, quantity, cost, sell }] of drafts.entries()) {
              const key = `${depot}/${instrument}`;
              const held = sums.get(key) ?? 0;
              if (sell && held > 0) {
                const sold = Math.min(quantity, held);
                bookSale(book, depot, instrument, sold, cost);
                sums.set(key, held - sold);
              } else if (!sell) {
                bookPurchase(book, depot, instrument, { buyTick: tick, quantity, cost });
                sums.set(key, held + quantity);
              }
            }
            for (const [key, sum] of sums) {
              const [depot, instrument] = key.split('/') as [DepotId, string];
              expect(holdingOf(book, depot, instrument)).toBe(sum);
            }
            for (const { quantity, lots } of book) {
              expect(quantity).toBeGreaterThan(0);
              expect(lots.reduce((sum, lot) => sum + lot.quantity, 0)).toBe(quantity);
            }
          },
        ),
      );
    });
  });

  describe('addDistribution', () => {
    it('adds a payout to the position and ignores instruments without one', () => {
      const book = positions.map(copyPosition);
      addDistribution(book, 'dep-2', 'i-2', 150);
      addDistribution(book, 'dep-2', 'i-2', 75);
      addDistribution(book, 'dep-7', 'i-2', 99);
      expect(book.map(({ distributions }) => distributions)).toEqual([0, 225, 0]);
    });
  });

  describe('copyPosition', () => {
    it('shares no lot with the original', () => {
      const copy = copyPosition(positions[0]);
      copy.lots[0].cost = 1;
      expect(positions[0].lots[0].cost).toBe(100_000);
      expect(copy).not.toBe(positions[0]);
    });
  });
});
