import fc from 'fast-check';

import { MAX_WATCHLIST_LENGTH } from './models/watchlist.model';
import { watchlistError } from './watchlist-logic';

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
