/** Why `enterGame` sends the player back to the selection. */
export const GAME_REJECTIONS = ['not-found', 'outdated', 'unavailable'] as const;
export type GameRejection = (typeof GAME_REJECTIONS)[number];

/** Steps of a running batch or background run (`progress` event, TS §8.3). */
export interface ProgressInfo {
  done: number;
  total: number;
}
