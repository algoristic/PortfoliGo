import { speedById, targetTick } from '@app/clock/domain/clock-logic';
import { ClockAnchor, SpeedId } from '@app/clock/domain/models/speed.model';
import { GAME_SECONDS_PER_TICK, Tick } from '@app/clock/domain/models/time.model';

import { ClockSettings, PacedRunner, PassResult } from './models/engine-clock.model';

const MS_PER_SECOND = 1000;

/** Backlog in real time above which the engine reports "overloaded" (TS §3.5). */
export const OVERLOAD_BACKLOG_MS = 2 * MS_PER_SECOND;

/**
 * Speed at which the game runs live, `null` when it rests (TS §3.6): a pause of the player stays a
 * pause; hidden, it runs in real time (`backgroundMode` `realtime`) or rests (`pause`); visible, it
 * runs at the chosen speed.
 */
export function effectiveSpeed(settings: Readonly<ClockSettings>): SpeedId | null {
  if (settings.paused) {
    return null;
  }
  if (settings.visible) {
    return settings.speed;
  }
  return settings.backgroundMode === 'realtime' ? 'realtime' : null;
}

/** Real time the runner at `tick` is behind `target` at `speed`; 0 while resting. */
export function backlogMs(target: Tick, tick: Tick, speed: SpeedId | null): number {
  if (speed === null || target <= tick) {
    return 0;
  }
  const gameMs = (target - tick) * GAME_SECONDS_PER_TICK * MS_PER_SECOND;
  return gameMs / speedById(speed).gameSecondsPerSecond;
}

/**
 * Clock of the worker loop (TS §3.5): the target tick follows from an anchor and the wall clock.
 * Every change of the settings sets a new anchor at the runner's tick, so a change never skips or
 * repeats ticks; a backlog at that moment is dropped instead of being caught up at the new speed.
 */
export class ClockPacer {
  #settings: ClockSettings;
  #anchor: ClockAnchor;

  constructor(settings: Readonly<ClockSettings>, tick: Tick, nowMs: number) {
    this.#settings = { ...settings };
    this.#anchor = { tick, realTimeMs: nowMs };
  }

  get settings(): Readonly<ClockSettings> {
    return this.#settings;
  }

  get anchor(): Readonly<ClockAnchor> {
    return this.#anchor;
  }

  get speed(): SpeedId | null {
    return effectiveSpeed(this.#settings);
  }

  /** Changes settings and sets a new anchor at `tick`. */
  update(change: Partial<ClockSettings>, tick: Tick, nowMs: number): void {
    this.#settings = { ...this.#settings, ...change };
    this.reanchor(tick, nowMs);
  }

  /** New anchor, e.g. after a game command or a jump (TS §8.5). */
  reanchor(tick: Tick, nowMs: number): void {
    this.#anchor = { tick, realTimeMs: nowMs };
  }

  target(nowMs: number): Tick {
    const speed = this.speed;
    return speed === null ? this.#anchor.tick : targetTick(this.#anchor, nowMs, speed);
  }

  /**
   * One pass of the loop: runs towards the target until `shouldYield` asks to stop. Ticks are
   * never skipped; if the runner falls behind, the effective speed drops (TS §3.5).
   */
  pass(runner: PacedRunner, nowMs: number, shouldYield: () => boolean): PassResult {
    const target = Math.max(this.target(nowMs), runner.tick);
    const reached = runner.runUntil(target, shouldYield);
    const backlog = backlogMs(target, runner.tick, this.speed);
    return { target, reached, backlogMs: backlog, overloaded: backlog > OVERLOAD_BACKLOG_MS };
  }
}
