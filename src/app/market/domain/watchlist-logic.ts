import { MAX_WATCHLIST_LENGTH, WatchlistCommandError } from './models/watchlist.model';

/**
 * Checks a new watchlist (US-MK-04, TS §8.2): at most `MAX_WATCHLIST_LENGTH` IDs, each an
 * instrument of the world and none twice. The length is checked first, then the IDs in list order;
 * the first violation decides. `null` when the list is valid.
 */
export function watchlistError(
  ids: readonly string[],
  instrumentIds: ReadonlySet<string>,
): WatchlistCommandError | null {
  if (ids.length > MAX_WATCHLIST_LENGTH) {
    return 'watchlist-too-long';
  }
  const seen = new Set<string>();
  for (const id of ids) {
    if (!instrumentIds.has(id)) {
      return 'unknown-instrument';
    }
    if (seen.has(id)) {
      return 'duplicate-instrument';
    }
    seen.add(id);
  }
  return null;
}
