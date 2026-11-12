import { speedById, targetTick } from '@app/clock/domain/clock-logic';
import { GAME_SECONDS_PER_TICK, Tick } from '@app/clock/domain/models/time.model';

import { BackgroundMode } from './models/game-state.model';

const MS_PER_SECOND = 1000;

/** Real time of one tick at real-time speed (TS §3.4). */
const REALTIME_MS_PER_TICK =
  (GAME_SECONDS_PER_TICK * MS_PER_SECOND) / speedById('realtime').gameSecondsPerSecond;

/** What the catch-up after loading depends on (TS §3.7). */
export interface CatchUpClock {
  /** Tick the game has reached after the replay. */
  tick: Tick;
  /** Pause of the player in the stored clock. */
  paused: boolean;
  /** Wall-clock time in ms since the Unix epoch at which the game was at `tick` in real time. */
  lastSeenAt: number;
}

/**
 * Target of the catch-up when a player is loaded (TS §3.7): while the app was closed, the game ran
 * in real time unless the player paused it or chose `backgroundMode` `pause`. Δ = now − `lastSeenAt`;
 * a wall clock set back counts as 0. The target is `tick + ⌊Δ / 60 s⌋`.
 */
export function catchUpTarget(
  clock: Readonly<CatchUpClock>,
  backgroundMode: BackgroundMode,
  nowMs: number,
): Tick {
  if (clock.paused || backgroundMode !== 'realtime') {
    return clock.tick;
  }
  return targetTick({ tick: clock.tick, realTimeMs: clock.lastSeenAt }, nowMs, 'realtime');
}

/**
 * `lastSeenAt` to store while a catch-up to `target` runs at `tick`: the wall-clock time at which the
 * game would have been at `tick` in real time. A restore from such a clock catches up to `target`
 * plus the real time since `nowMs`, so an interrupted catch-up loses nothing (inverse of
 * `catchUpTarget`).
 */
export function catchUpSeenAt(nowMs: number, tick: Tick, target: Tick): number {
  return nowMs - Math.max(0, target - tick) * REALTIME_MS_PER_TICK;
}
