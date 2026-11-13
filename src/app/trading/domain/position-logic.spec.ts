import fc from 'fast-check';

import { DepotId } from '@app/banking/domain/models/account.model';
import { UnitPosting } from '@app/banking/domain/models/ledger.model';

import { Position } from './models/position.model';
import { bookUnits, hasPositions, holdingOf } from './position-logic';

const SHARE = 1_000_000;

function units(depotId: DepotId, instrumentId: string, quantity: number): UnitPosting {
  return { depotId, instrumentId, quantity };
}

describe('position-logic', () => {
  const positions: readonly Position[] = [
    { depotId: 'dep-2', instrumentId: 'i-1', quantity: 10 * SHARE },
    { depotId: 'dep-2', instrumentId: 'i-2', quantity: 1_500_000 },
    { depotId: 'dep-5', instrumentId: 'i-1', quantity: 3 * SHARE },
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

  describe('bookUnits', () => {
    // TS §7.5: buy 10, sell 2.5, then sell the rest
    it('adds, reduces and removes a position', () => {
      const book: Position[] = [];
      bookUnits(book, [units('dep-2', 'i-1', 10 * SHARE)]);
      expect(book).toEqual([{ depotId: 'dep-2', instrumentId: 'i-1', quantity: 10 * SHARE }]);
      bookUnits(book, [units('dep-2', 'i-9', 1)]);
      bookUnits(book, [units('dep-2', 'i-1', -2_500_000)]);
      expect(book).toEqual([
        { depotId: 'dep-2', instrumentId: 'i-1', quantity: 7_500_000 },
        { depotId: 'dep-2', instrumentId: 'i-9', quantity: 1 },
      ]);
      bookUnits(book, [units('dep-2', 'i-1', -7_500_000)]);
      expect(book).toEqual([{ depotId: 'dep-2', instrumentId: 'i-9', quantity: 1 }]);
    });

    it('keeps positions of other depots apart', () => {
      const book: Position[] = [{ depotId: 'dep-2', instrumentId: 'i-1', quantity: SHARE }];
      bookUnits(book, [units('dep-5', 'i-1', 2 * SHARE)]);
      expect(holdingOf(book, 'dep-2', 'i-1')).toBe(SHARE);
      expect(holdingOf(book, 'dep-5', 'i-1')).toBe(2 * SHARE);
    });

    it.each<[string, UnitPosting]>([
      ['more than the holding', units('dep-2', 'i-1', -2 * SHARE - 1)],
      ['an instrument without position', units('dep-2', 'i-3', -1)],
      ['half a millionth', units('dep-2', 'i-1', 0.5)],
    ])('throws and changes nothing for %s', (_case, posting) => {
      const book: Position[] = [{ depotId: 'dep-2', instrumentId: 'i-1', quantity: SHARE }];
      expect(() => bookUnits(book, [units('dep-2', 'i-1', SHARE), posting])).toThrow(RangeError);
      expect(book).toEqual([{ depotId: 'dep-2', instrumentId: 'i-1', quantity: SHARE }]);
    });

    it('keeps the holding equal to the sum of the unit postings', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              depot: fc.constantFrom<DepotId>('dep-2', 'dep-5'),
              instrument: fc.constantFrom('i-1', 'i-2'),
              quantity: fc.integer({ min: 1, max: 5 * SHARE }),
              sell: fc.boolean(),
            }),
            { maxLength: 30 },
          ),
          (drafts) => {
            const book: Position[] = [];
            const sums = new Map<string, number>();
            for (const { depot, instrument, quantity, sell } of drafts) {
              const key = `${depot}/${instrument}`;
              const held = sums.get(key) ?? 0;
              const delta = sell ? -Math.min(quantity, held) : quantity;
              bookUnits(book, [units(depot, instrument, delta)]);
              sums.set(key, held + delta);
            }
            for (const [key, sum] of sums) {
              const [depot, instrument] = key.split('/') as [DepotId, string];
              expect(holdingOf(book, depot, instrument)).toBe(sum);
            }
            expect(book.every((position) => position.quantity > 0)).toBe(true);
          },
        ),
      );
    });
  });
});
