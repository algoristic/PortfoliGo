import { speedById, targetTick } from '@app/clock/domain/clock-logic';
import { ClockAnchor, SpeedId } from '@app/clock/domain/models/speed.model';
import { GAME_SECONDS_PER_TICK, Tick } from '@app/clock/domain/models/time.model';

import { backgroundPauseAt, REALTIME_MS_PER_TICK, runsInBackground } from './background-logic';
import { ClockSettings, PacedRunner, PassResult } from './models/engine-clock.model';
import { PlayerState } from './models/game-state.model';

const MS_PER_SECOND = 1000;

/** Backlog in real time above which the engine reports "overloaded" (TS §3.5). */
export const OVERLOAD_BACKLOG_MS = 2 * MS_PER_SECOND;

/**
 * Real time between two passes of the worker loop above which the time in between counts as a gap
 * in the loop (closed, frozen, suspended) and runs only in real time (TS §3.6, E-35).
 */
export const TICK_GAP_THRESHOLD_MS = 5 * MS_PER_SECOND;

/**
 * Speed at which the game runs live, `null` when it rests (TS §3.6): a pause of the player stays a
 * pause; visible, it runs at the chosen speed; hidden, `backgroundMode` decides: real time
 * (`realtime`), rest (`pause`), the chosen speed (`keep-speed`) or `backgroundSpeed`
 * (`custom-speed`).
 */
export function effectiveSpeed(settings: Readonly<ClockSettings>): SpeedId | null {
  if (settings.paused) {
    return null;
  }
  if (settings.visible) {
    return settings.speed;
  }
  switch (settings.backgroundMode) {
    case 'realtime':
      return 'realtime';
    case 'pause':
      return null;
    case 'keep-speed':
      return settings.speed;
    case 'custom-speed':
      return settings.backgroundSpeed;
  }
}

/** The clock settings that come from the player state (TS §3.6). */
export function backgroundClockSettings(
  player: Readonly<PlayerState>,
): Pick<ClockSettings, 'backgroundMode' | 'backgroundSpeed' | 'backgroundPauseAfter'> {
  return {
    backgroundMode: player.backgroundMode,
    backgroundSpeed: player.backgroundSpeed,
    backgroundPauseAfter: player.backgroundPauseAfter,
  };
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
 * Clock of the worker loop (TS §3.5, §3.6): the target tick follows from an anchor and the wall
 * clock. Every change of the settings sets a new anchor at the runner's tick, so a change never
 * skips or repeats ticks; a backlog at that moment is dropped instead of being caught up at the new
 * speed.
 *
 * Hidden with `backgroundPauseAfter`, the target stops at the tick that belongs to the deadline
 * (`hiddenSince` + deadline) and the pass reports `pauseDue`. More than `TICK_GAP_THRESHOLD_MS`
 * between two passes, or a `freeze` until `resume`, is a gap: the target moves on only in real
 * time for it and the anchor is set anew. Fractions of a real-time tick carry over to the next gap
 * until the next new anchor.
 */
export class ClockPacer {
  #settings: ClockSettings;
  #anchor: ClockAnchor;
  #hiddenSince: number | null;
  #lastPassMs: number;
  #gapCarryMs = 0;
  #frozenAtMs: number | null = null;

  /** `hiddenSince` defaults to `nowMs` when hidden; pass the stored one to continue a deadline. */
  constructor(
    settings: Readonly<ClockSettings>,
    tick: Tick,
    nowMs: number,
    hiddenSince: number | null = settings.visible ? null : nowMs,
  ) {
    this.#settings = { ...settings };
    this.#anchor = { tick, realTimeMs: nowMs };
    this.#hiddenSince = settings.visible ? null : hiddenSince;
    this.#lastPassMs = nowMs;
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

  /** Wall-clock time since which the app is hidden, `null` while visible (stored with the clock). */
  get hiddenSince(): number | null {
    return this.#hiddenSince;
  }

  /**
   * Wall-clock time at which the hidden, running game pauses (`backgroundPauseAfter`), `null` when
   * no deadline applies; the host may set a timer for it.
   */
  get pauseAt(): number | null {
    const { visible, paused, backgroundMode, backgroundPauseAfter } = this.#settings;
    if (visible || paused || this.#hiddenSince === null || !runsInBackground(backgroundMode)) {
      return null;
    }
    return backgroundPauseAt(this.#hiddenSince, backgroundPauseAfter);
  }

  /** Changes settings and sets a new anchor at `tick`; becoming hidden starts `hiddenSince`. */
  update(change: Partial<ClockSettings>, tick: Tick, nowMs: number): void {
    const wasVisible = this.#settings.visible;
    this.#settings = { ...this.#settings, ...change };
    if (this.#settings.visible) {
      this.#hiddenSince = null;
    } else if (wasVisible) {
      this.#hiddenSince = nowMs;
    }
    this.reanchor(tick, nowMs);
  }

  /** New anchor, e.g. after a game command or a jump (TS §8.5). */
  reanchor(tick: Tick, nowMs: number): void {
    this.#anchor = { tick, realTimeMs: nowMs };
    this.#lastPassMs = nowMs;
    this.#gapCarryMs = 0;
    this.#frozenAtMs = null;
  }

  target(nowMs: number): Tick {
    const speed = this.speed;
    if (speed === null) {
      return this.#anchor.tick;
    }
    const pauseAt = this.pauseAt;
    return targetTick(this.#anchor, pauseAt === null ? nowMs : Math.min(nowMs, pauseAt), speed);
  }

  /** The page was frozen (Chromium `freeze`); the time until `resume` counts as a gap. */
  freeze(nowMs: number): void {
    this.#frozenAtMs ??= nowMs;
  }

  /** The page runs again after `freeze`: the time since then runs only in real time (TS §3.6). */
  resume(nowMs: number): void {
    const frozenAtMs = this.#frozenAtMs;
    if (frozenAtMs === null) {
      return;
    }
    this.#frozenAtMs = null;
    const fromMs =
      frozenAtMs - this.#lastPassMs > TICK_GAP_THRESHOLD_MS ? this.#lastPassMs : frozenAtMs;
    this.#gap(fromMs, nowMs);
    this.#lastPassMs = Math.max(this.#lastPassMs, nowMs);
  }

  /**
   * One pass of the loop: runs towards the target until `shouldYield` asks to stop. Ticks are
   * never skipped; if the runner falls behind, the effective speed drops (TS §3.5). A gap since the
   * last pass runs only in real time (TS §3.6).
   */
  pass(runner: PacedRunner, nowMs: number, shouldYield: () => boolean): PassResult {
    if (this.#frozenAtMs !== null) {
      this.resume(nowMs);
    } else if (nowMs - this.#lastPassMs > TICK_GAP_THRESHOLD_MS) {
      this.#gap(this.#lastPassMs, nowMs);
    }
    this.#lastPassMs = Math.max(this.#lastPassMs, nowMs);
    const target = Math.max(this.target(nowMs), runner.tick);
    const reached = runner.runUntil(target, shouldYield);
    const backlog = backlogMs(target, runner.tick, this.speed);
    const pauseAt = this.pauseAt;
    return {
      target,
      reached,
      backlogMs: backlog,
      overloaded: backlog > OVERLOAD_BACKLOG_MS,
      pauseDue: pauseAt !== null && nowMs >= pauseAt && runner.tick >= target,
    };
  }

  /**
   * Gap from `fromMs` to `nowMs`: the target at `fromMs` plus the real-time ticks of the gap (up to
   * the deadline) becomes the new anchor. At real-time speed nothing changes.
   */
  #gap(fromMs: number, nowMs: number): void {
    const speed = this.speed;
    if (speed === null || speed === 'realtime') {
      return;
    }
    const pauseAt = this.pauseAt;
    const endMs = pauseAt === null ? nowMs : Math.min(nowMs, pauseAt);
    const gapMs = this.#gapCarryMs + Math.max(0, endMs - fromMs);
    const ticks = Math.floor(gapMs / REALTIME_MS_PER_TICK);
    const before = this.target(fromMs);
    this.#anchor = { tick: before + ticks, realTimeMs: nowMs };
    this.#gapCarryMs = gapMs - ticks * REALTIME_MS_PER_TICK;
  }
}
