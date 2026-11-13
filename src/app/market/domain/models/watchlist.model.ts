/** Most instruments on a player's watchlist (US-MK-04, TS §8.2). */
export const MAX_WATCHLIST_LENGTH = 50;

/** Errors of `updateWatchlist` (TS §8.2). */
export const WATCHLIST_COMMAND_ERRORS = [
  /** An ID that is no instrument of the world (shared with `instrumentDetails` and `candles`). */
  'unknown-instrument',
  /** An ID that appears twice in the list. */
  'duplicate-instrument',
  /** More than `MAX_WATCHLIST_LENGTH` IDs. */
  'watchlist-too-long',
] as const;
export type WatchlistCommandError = (typeof WATCHLIST_COMMAND_ERRORS)[number];
