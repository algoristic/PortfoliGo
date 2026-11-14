import { targetTick } from '@app/clock/domain/clock-logic';
import { Tick } from '@app/clock/domain/models/time.model';

import {
  backgroundPauseAfterMs,
  backgroundPauseAt,
  REALTIME_MS_PER_TICK,
  runsInBackground,
} from './background-logic';
import { PlayerState } from './models/game-state.model';

/** What the catch-up after loading depends on (TS §3.7). */
export interface CatchUpClock {
  /** Tick the game has reached after the replay. */
  tick: Tick;
  /** Pause of the player in the stored clock. */
  paused: boolean;
  /** Wall-clock time in ms since the Unix epoch at which the game was at `tick` in real time. */
  lastSeenAt: number;
  /**
   * Wall-clock time since which the app was hidden when the clock was stored (TS §9.2); missing or
   * `null` when it was visible, then the absence starts at `lastSeenAt`.
   */
  hiddenSince?: number | null;
}

/** The player's settings the catch-up depends on (TS §3.6). */
export type CatchUpSettings = Pick<PlayerState, 'backgroundMode' | 'backgroundPauseAfter'>;

export interface CatchUpResult {
  /** Tick to catch up to. */
  target: Tick;
  /** `true` when the game is paused afterwards: the player's pause or `backgroundPauseAfter`. */
  paused: boolean;
}

/**
 * Target of the catch-up when a player is loaded (TS §3.7): while the app was closed, every running
 * mode ran in real time; the player's pause and `backgroundMode` `pause` rest. Δ = now −
 * `lastSeenAt`, a wall clock set back counts as 0; the target is `tick + ⌊Δ / 60 s⌋`. With
 * `backgroundPauseAfter`, the absence counts from `hiddenSince` (or `lastSeenAt`); once the deadline
 * has passed, the target is the tick of the deadline and the game is paused afterwards.
 */
export function catchUpTarget(
  clock: Readonly<CatchUpClock>,
  settings: Readonly<CatchUpSettings>,
  nowMs: number,
): CatchUpResult {
  if (clock.paused || !runsInBackground(settings.backgroundMode)) {
    return { target: clock.tick, paused: clock.paused };
  }
  const anchor = { tick: clock.tick, realTimeMs: clock.lastSeenAt };
  const pauseAt = backgroundPauseAt(
    clock.hiddenSince ?? clock.lastSeenAt,
    settings.backgroundPauseAfter,
  );
  if (pauseAt !== null && nowMs >= pauseAt) {
    return { target: targetTick(anchor, pauseAt, 'realtime'), paused: true };
  }
  return { target: targetTick(anchor, nowMs, 'realtime'), paused: false };
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

/**
 * `hiddenSince` to store with `catchUpSeenAt` while a catch-up runs: if it ends in the pause of
 * `backgroundPauseAfter`, the deadline lies at `nowMs`, so a restore catches up to the same target
 * and pauses; otherwise the host's own `hiddenSince` (`null` while visible).
 */
export function catchUpHiddenSince(
  nowMs: number,
  result: Readonly<CatchUpResult>,
  settings: Readonly<CatchUpSettings>,
  hiddenSince: number | null,
): number | null {
  const pauseAfterMs = backgroundPauseAfterMs(settings.backgroundPauseAfter);
  if (!result.paused || pauseAfterMs === null || !runsInBackground(settings.backgroundMode)) {
    return hiddenSince;
  }
  return nowMs - pauseAfterMs;
}
