import fc from 'fast-check';

import { MAX_WATCHLIST_LENGTH } from './models/watchlist.model';
import {
  addToWatchlist,
  moveWatchlistItem,
  removeFromWatchlist,
  watchlistError,
} from './watchlist-logic';

const KNOWN = new Set(['c1', 'c2', 'i1', 'i1-tr', 'e1']);
const MANY = new Set(Array.from({ length: MAX_WATCHLIST_LENGTH + 10 }, (_v, n) => `c${n + 1}`));

function ids(count: number): string[] {
  return Array.from({ length: count }, (_v, n) => `c${n + 1}`);
}

describe('watchlistError', () => {
  // TS §8.2: rules of `updateWatchlist`
  it.each([
    ['an empty list', [], null],
    ['instruments of every kind', ['e1', 'i1-tr', 'c2', 'i1'], null],
    ['an unknown ID', ['c1', 'x9'], 'unknown-instrument'],
    ['the index ID with another suffix', ['i1-pr'], 'unknown-instrument'],
    ['an ID twice', ['c1', 'c2', 'c1'], 'duplicate-instrument'],
    ['a duplicate before an unknown ID', ['c1', 'c1', 'x9'], 'duplicate-instrument'],
    ['an unknown ID before a duplicate', ['x9', 'c1', 'c1'], 'unknown-instrument'],
  ] as const)('answers %s with %s', (_name, list, expected) => {
    expect(watchlistError(list, KNOWN)).toBe(expected);
  });

  it('accepts the longest list and rejects one more before looking at the IDs', () => {
    expect(watchlistError(ids(MAX_WATCHLIST_LENGTH), MANY)).toBeNull();
    expect(watchlistError(ids(MAX_WATCHLIST_LENGTH + 1), MANY)).toBe('watchlist-too-long');
    expect(watchlistError([...ids(MAX_WATCHLIST_LENGTH), 'c1'], MANY)).toBe('watchlist-too-long');
  });

  it('accepts any order of distinct known IDs and rejects it with one ID repeated', () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray([...MANY], { minLength: 1, maxLength: MAX_WATCHLIST_LENGTH - 1 }),
        fc.nat(),
        fc.nat(),
        (list, from, to) => {
          expect(watchlistError(list, MANY)).toBeNull();
          const repeated = [...list];
          repeated.splice(to % (list.length + 1), 0, list[from % list.length]);
          expect(watchlistError(repeated, MANY)).toBe('duplicate-instrument');
        },
      ),
    );
  });
});

describe('addToWatchlist', () => {
  // TS §8.2, list changes of the UI: a new entry goes to the end; nothing twice, never more than 50
  it.each([
    ['an empty list', [], 'c1', ['c1']],
    ['the end of the list', ['c2', 'c1'], 'e1', ['c2', 'c1', 'e1']],
    ['nothing for an ID already on it', ['c2', 'c1'], 'c2', ['c2', 'c1']],
  ] as const)('adds to %s', (_name, list, id, expected) => {
    expect(addToWatchlist(list, id)).toEqual(expected);
  });

  it('keeps a full list and its reference', () => {
    const full = ids(MAX_WATCHLIST_LENGTH);
    expect(addToWatchlist(full, 'x1')).toBe(full);
    expect(addToWatchlist(ids(MAX_WATCHLIST_LENGTH - 1), 'x1')).toHaveLength(MAX_WATCHLIST_LENGTH);
  });
});

describe('removeFromWatchlist', () => {
  it.each([
    ['the first entry', ['c1', 'c2', 'c3'], 'c1', ['c2', 'c3']],
    ['an entry in the middle', ['c1', 'c2', 'c3'], 'c2', ['c1', 'c3']],
    ['the last entry', ['c1', 'c2', 'c3'], 'c3', ['c1', 'c2']],
    ['nothing for an ID not on it', ['c1', 'c2'], 'x9', ['c1', 'c2']],
  ] as const)('removes %s', (_name, list, id, expected) => {
    expect(removeFromWatchlist(list, id)).toEqual(expected);
  });
});

describe('moveWatchlistItem', () => {
  // TS §8.2, list changes of the UI: positions as drag and drop reports them (before and after)
  it.each([
    ['down', ['a', 'b', 'c', 'd'], 0, 2, ['b', 'c', 'a', 'd']],
    ['up', ['a', 'b', 'c', 'd'], 3, 1, ['a', 'd', 'b', 'c']],
    ['to the end', ['a', 'b', 'c'], 0, 2, ['b', 'c', 'a']],
    ['to the top', ['a', 'b', 'c'], 2, 0, ['c', 'a', 'b']],
    ['one step down', ['a', 'b', 'c'], 1, 2, ['a', 'c', 'b']],
    ['nowhere for the same position', ['a', 'b', 'c'], 1, 1, ['a', 'b', 'c']],
    ['nowhere above the list', ['a', 'b', 'c'], 0, -1, ['a', 'b', 'c']],
    ['nowhere below the list', ['a', 'b', 'c'], 2, 3, ['a', 'b', 'c']],
    ['nowhere from outside', ['a', 'b', 'c'], 3, 0, ['a', 'b', 'c']],
  ] as const)('moves an entry %s', (_name, list, from, to, expected) => {
    expect(moveWatchlistItem(list, from, to)).toEqual(expected);
  });

  it('keeps a permutation without duplicates and puts the entry at its target', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string({ minLength: 1, maxLength: 4 }), {
          minLength: 1,
          maxLength: MAX_WATCHLIST_LENGTH,
        }),
        fc.nat(),
        fc.nat(),
        (list, a, b) => {
          const from = a % list.length;
          const to = b % list.length;
          const moved = moveWatchlistItem(list, from, to);
          expect([...moved].sort()).toEqual([...list].sort());
          expect(new Set(moved).size).toBe(list.length);
          expect(moved[to]).toBe(list[from]);
          // The others keep their order.
          expect(moved.filter((id) => id !== list[from])).toEqual(
            list.filter((id) => id !== list[from]),
          );
        },
      ),
    );
  });

  it('keeps every list free of duplicates under any sequence of changes', () => {
    const pool = ids(MAX_WATCHLIST_LENGTH + 5);
    const change = fc.oneof(
      fc.record({ kind: fc.constant('add' as const), id: fc.constantFrom(...pool) }),
      fc.record({ kind: fc.constant('remove' as const), id: fc.constantFrom(...pool) }),
      fc.record({ kind: fc.constant('move' as const), from: fc.nat(60), to: fc.nat(60) }),
    );
    fc.assert(
      fc.property(fc.array(change, { maxLength: 120 }), (changes) => {
        let list: readonly string[] = [];
        for (const step of changes) {
          list =
            step.kind === 'add'
              ? addToWatchlist(list, step.id)
              : step.kind === 'remove'
                ? removeFromWatchlist(list, step.id)
                : moveWatchlistItem(list, step.from, step.to);
          expect(watchlistError(list, MANY)).toBeNull();
        }
      }),
    );
  });
});
