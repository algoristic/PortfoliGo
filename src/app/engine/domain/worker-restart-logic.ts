import { Tick } from '@app/clock/domain/models/time.model';

/** Failures after which the `EngineService` stops restarting the worker (TS §8.5). */
export const MAX_WORKER_FAILURES = 3;

/** Real time in which `MAX_WORKER_FAILURES` failures end the restarts, game time or not (TS §8.5). */
export const WORKER_FAILURE_WINDOW_MS = 60_000;

/** What the service remembers of the worker failures so far (TS §8.5). */
export interface WorkerFailureHistory {
  /** Failures since the game time last moved beyond the tick of the last failure. */
  inRow: number;
  /** Tick of the last `clock` event before the last failure; `null` without one. */
  tick: Tick | null;
  /** Wall clock of the failures within the window before the last one, oldest first. */
  recentMs: readonly number[];
}

export const NO_WORKER_FAILURES: WorkerFailureHistory = { inRow: 0, tick: null, recentMs: [] };

export interface WorkerFailure {
  /** Wall clock of the failure in milliseconds. */
  atMs: number;
  /** Tick of the last `clock` event the service saw; `null` without one. */
  lastTick: Tick | null;
}

export interface WorkerFailureDecision {
  history: WorkerFailureHistory;
  /** `false`: the service gives up and shows the error with the hint on the export. */
  restart: boolean;
}

/**
 * Records a failure of the worker (TS §8.5): the service restarts it unless this is the
 * `MAX_WORKER_FAILURES`-th failure in a row at the same place (no `clock` event beyond the tick of
 * the previous failure) or the `MAX_WORKER_FAILURES`-th within `WORKER_FAILURE_WINDOW_MS`. The window
 * ends a loop that the place alone misses: `clock` events are throttled, so a game that fails at the
 * same tick may still report ticks beyond the last reported one before failing again.
 */
export function recordWorkerFailure(
  history: WorkerFailureHistory,
  failure: WorkerFailure,
): WorkerFailureDecision {
  const recentMs = [
    ...history.recentMs.filter((atMs) => failure.atMs - atMs < WORKER_FAILURE_WINDOW_MS),
    failure.atMs,
  ];
  const inRow = history.inRow + 1;
  return {
    history: { inRow, tick: failure.lastTick, recentMs },
    restart: inRow < MAX_WORKER_FAILURES && recentMs.length < MAX_WORKER_FAILURES,
  };
}

/**
 * A `clock` event: game time beyond the tick of the last failure ends the row of failures at the
 * same place; the failures in the real-time window still count.
 */
export function recordWorkerProgress(
  history: WorkerFailureHistory,
  tick: Tick,
): WorkerFailureHistory {
  return history.tick !== null && tick > history.tick
    ? { ...history, inRow: 0, tick: null }
    : history;
}
