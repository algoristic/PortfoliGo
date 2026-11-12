import { Tick } from '@app/clock/domain/models/time.model';

/** Why `enterGame` sends the player back to the selection. */
export const GAME_REJECTIONS = ['not-found', 'outdated', 'unavailable'] as const;
export type GameRejection = (typeof GAME_REJECTIONS)[number];

/** Steps of a running batch or background run (`progress` event, TS §8.3). */
export interface ProgressInfo {
  done: number;
  total: number;
}

/** `pgo.lastTick` (TS §9.3): tick of the last `clock` event per player, saved at `pagehide`. */
export type LastTicks = Record<string, Tick>;

export const LAST_TICK_VERSION = 1;
