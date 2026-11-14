import { LoopTimer } from '../worker/engine-host.model';

/** Wall-clock start of the manual timeline: 12.11.2026, 00:00 UTC. */
export const MANUAL_TIMELINE_START_MS = 1_794_441_600_000;

interface ManualTimer {
  id: number;
  dueMs: number;
  callback: () => void;
}

/**
 * Wall clock and loop timer of the worker host for tests (CLAUDE.md §10): time moves only with
 * `advance`, which runs the due timers in order of their due time (ties in the order they were
 * set) and sets the clock to each due time before the callback.
 */
export class ManualTimeline implements LoopTimer {
  #nowMs: number;
  #nextId = 1;
  #timers: ManualTimer[] = [];

  constructor(startMs = MANUAL_TIMELINE_START_MS) {
    this.#nowMs = startMs;
  }

  readonly now = (): number => this.#nowMs;

  set(callback: () => void, delayMs: number): number {
    const id = this.#nextId++;
    this.#timers.push({ id, dueMs: this.#nowMs + Math.max(0, delayMs), callback });
    return id;
  }

  clear(handle: unknown): void {
    this.#timers = this.#timers.filter((timer) => timer.id !== handle);
  }

  /** Number of timers that are set. */
  get pending(): number {
    return this.#timers.length;
  }

  /** Moves the clock forward by `ms` and runs every timer that falls due on the way. */
  advance(ms: number): void {
    const endMs = this.#nowMs + Math.max(0, ms);
    for (let timer = this.#next(endMs); timer !== undefined; timer = this.#next(endMs)) {
      this.#timers = this.#timers.filter((candidate) => candidate !== timer);
      this.#nowMs = Math.max(this.#nowMs, timer.dueMs);
      timer.callback();
    }
    this.#nowMs = endMs;
  }

  /**
   * Moves the clock forward by `ms` without running timers, as when the process is frozen or
   * suspended (TS §3.6); the overdue timers run with the next `advance` or `step`.
   */
  suspend(ms: number): void {
    this.#nowMs += Math.max(0, ms);
  }

  /**
   * Runs only the earliest timer, moving the clock to its due time; e.g. one pass of a jump.
   * Returns `false` when no timer is set.
   */
  step(): boolean {
    const timer = this.#next(Number.POSITIVE_INFINITY);
    if (timer === undefined) {
      return false;
    }
    this.#timers = this.#timers.filter((candidate) => candidate !== timer);
    this.#nowMs = Math.max(this.#nowMs, timer.dueMs);
    timer.callback();
    return true;
  }

  #next(endMs: number): ManualTimer | undefined {
    let next: ManualTimer | undefined;
    for (const timer of this.#timers) {
      if (timer.dueMs <= endMs && (next === undefined || timer.dueMs < next.dueMs)) {
        next = timer;
      }
    }
    return next;
  }
}
