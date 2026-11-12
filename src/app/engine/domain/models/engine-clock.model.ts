import { SpeedId } from '@app/clock/domain/models/speed.model';
import { Tick } from '@app/clock/domain/models/time.model';

import { BackgroundMode } from './game-state.model';

/** What decides how fast the game runs live (TS §3.5, §3.6). */
export interface ClockSettings {
  /** Speed chosen by the player; it stays chosen while paused or hidden. */
  speed: SpeedId;
  /** Pause set by the player; it is never lifted by the engine (E-02). */
  paused: boolean;
  visible: boolean;
  backgroundMode: BackgroundMode;
}

/** The part of the `GameEngine` the clock drives. */
export interface PacedRunner {
  readonly tick: Tick;
  runUntil(targetTick: Tick, shouldYield: () => boolean): boolean;
}

/** Result of one pass of the worker loop. */
export interface PassResult {
  target: Tick;
  /** `true` when the runner reached the target in this pass. */
  reached: boolean;
  /** Real time the runner is behind the target at the effective speed. */
  backlogMs: number;
  overloaded: boolean;
}
