import { speedById, targetTick } from '@app/clock/domain/clock-logic';
import { ClockAnchor, SpeedId, SPEEDS } from '@app/clock/domain/models/speed.model';
import { GAME_SECONDS_PER_TICK, Tick } from '@app/clock/domain/models/time.model';

import {
  BACKGROUND_MODES,
  BACKGROUND_PAUSE_AFTER_MINUTES,
  BackgroundMode,
  BackgroundPauseAfter,
} from './models/game-state.model';

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;

/** Real time of one tick at real-time speed (TS §3.4). */
export const REALTIME_MS_PER_TICK =
  (GAME_SECONDS_PER_TICK * MS_PER_SECOND) / speedById('realtime').gameSecondsPerSecond;

export function isBackgroundMode(value: unknown): value is BackgroundMode {
  return (BACKGROUND_MODES as readonly unknown[]).includes(value);
}

/** Every speed level of TS §3.4 is a valid `backgroundSpeed`. */
export function isBackgroundSpeed(value: unknown): value is SpeedId {
  return SPEEDS.some((speed) => speed.id === value);
}

export function isBackgroundPauseAfter(value: unknown): value is BackgroundPauseAfter {
  return value === null || (BACKGROUND_PAUSE_AFTER_MINUTES as readonly unknown[]).includes(value);
}

/** Modes in which the game runs while hidden or closed; `backgroundPauseAfter` applies to them. */
export function runsInBackground(mode: BackgroundMode): boolean {
  return mode !== 'pause';
}

/** `backgroundPauseAfter` in real-time milliseconds, `null` when off. */
export function backgroundPauseAfterMs(pauseAfter: BackgroundPauseAfter): number | null {
  return pauseAfter === null ? null : pauseAfter * MS_PER_MINUTE;
}

/**
 * Wall-clock time at which a game hidden since `hiddenSince` pauses (TS §3.6): `hiddenSince` +
 * `pauseAfter` minutes; `null` without a deadline.
 */
export function backgroundPauseAt(
  hiddenSince: number,
  pauseAfter: BackgroundPauseAfter,
): number | null {
  const pauseAfterMs = backgroundPauseAfterMs(pauseAfter);
  return pauseAfterMs === null ? null : hiddenSince + pauseAfterMs;
}

/**
 * Tick at which a game hidden since `hiddenSince` pauses (TS §3.6): the tick the clock with
 * `anchor` and `speed` reaches at the deadline; `null` without a deadline. An anchor set after the
 * deadline yields its own tick.
 */
export function backgroundPauseTick(
  anchor: Readonly<ClockAnchor>,
  hiddenSince: number,
  pauseAfter: BackgroundPauseAfter,
  speed: SpeedId,
): Tick | null {
  const pauseAt = backgroundPauseAt(hiddenSince, pauseAfter);
  return pauseAt === null ? null : targetTick(anchor, pauseAt, speed);
}
