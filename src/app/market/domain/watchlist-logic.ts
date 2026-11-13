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

/**
 * The watchlist with `id` appended at the end (US-MK-04). The same list when `id` is already on it
 * or the list is full.
 */
export function addToWatchlist(ids: readonly string[], id: string): readonly string[] {
  return ids.includes(id) || ids.length >= MAX_WATCHLIST_LENGTH ? ids : [...ids, id];
}

/** The watchlist without `id`; the same list when `id` is not on it. */
export function removeFromWatchlist(ids: readonly string[], id: string): readonly string[] {
  return ids.includes(id) ? ids.filter((other) => other !== id) : ids;
}

/**
 * The watchlist with the entry at `from` moved to `to` (both list positions, as drag and drop
 * reports them); the others keep their order. The same list when nothing moves or a position lies
 * outside the list.
 */
export function moveWatchlistItem(
  ids: readonly string[],
  from: number,
  to: number,
): readonly string[] {
  const inside = (index: number): boolean =>
    Number.isInteger(index) && index >= 0 && index < ids.length;
  if (from === to || !inside(from) || !inside(to)) {
    return ids;
  }
  const moved = [...ids];
  const [id] = moved.splice(from, 1);
  moved.splice(to, 0, id);
  return moved;
}
