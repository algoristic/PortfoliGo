import { ClockAnchor, Speed, SpeedId, SPEEDS } from './models/speed.model';
import { GAME_SECONDS_PER_TICK, Tick } from './models/time.model';

const MS_PER_SECOND = 1000;

export function speedById(id: SpeedId): Speed {
  const speed = SPEEDS.find((candidate) => candidate.id === id);
  if (!speed) {
    throw new Error(`speedById: unknown speed ${id}`);
  }
  return speed;
}

/** Next faster speed; the fastest speed stays. */
export function fasterSpeed(id: SpeedId): SpeedId {
  const index = SPEEDS.findIndex((speed) => speed.id === id);
  return SPEEDS[Math.min(index + 1, SPEEDS.length - 1)].id;
}

/** Next slower speed; the slowest speed stays. */
export function slowerSpeed(id: SpeedId): SpeedId {
  const index = SPEEDS.findIndex((speed) => speed.id === id);
  return SPEEDS[Math.max(index - 1, 0)].id;
}

/**
 * Tick the engine should have reached at `nowMs` (TS §3.5). Integer arithmetic keeps real time
 * (1/60 tick per second) exact; a wall clock set back yields no progress (TS §3.7). Exact as long
 * as `elapsedMs × gameSecondsPerSecond` stays below 2^53 (at 1 w/s about 170 days of real time).
 */
export function targetTick(anchor: ClockAnchor, nowMs: number, speed: SpeedId): Tick {
  const elapsedMs = Math.max(0, nowMs - anchor.realTimeMs);
  const elapsedGameMs = elapsedMs * speedById(speed).gameSecondsPerSecond;
  return anchor.tick + Math.floor(elapsedGameMs / (GAME_SECONDS_PER_TICK * MS_PER_SECOND));
}
