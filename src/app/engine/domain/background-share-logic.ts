import { speedById } from '@app/clock/domain/clock-logic';
import { SpeedId } from '@app/clock/domain/models/speed.model';

/**
 * Upper limit of a background job's computing time as a share of the wall clock (TS §6.8): the job
 * earns `share` milliseconds per elapsed millisecond, holds at most `maxSliceMs` and pays for what
 * it used. A slice that took longer than granted leaves a debt, so the limit holds on average. A
 * wall clock set back earns nothing.
 */
export class WorkShare {
  readonly #share: number;
  readonly #maxSliceMs: number;
  #allowanceMs = 0;
  #lastMs: number;

  constructor(share: number, maxSliceMs: number, nowMs: number) {
    if (!(share > 0 && share <= 1)) {
      throw new RangeError(`WorkShare: share must be in (0, 1], got ${share}`);
    }
    this.#share = share;
    this.#maxSliceMs = maxSliceMs;
    this.#lastMs = nowMs;
  }

  /** Milliseconds the job may work at `nowMs` (≤ `maxSliceMs`; ≤ 0 while it pays a debt). */
  available(nowMs: number): number {
    const elapsed = Math.max(0, nowMs - this.#lastMs);
    this.#lastMs = Math.max(this.#lastMs, nowMs);
    this.#allowanceMs = Math.min(this.#maxSliceMs, this.#allowanceMs + elapsed * this.#share);
    return this.#allowanceMs;
  }

  /** Records `ms` of work. */
  spend(ms: number): void {
    this.#allowanceMs -= Math.max(0, ms);
  }
}

/**
 * Whether the live session close computes high and low from the minute curves (TS §6.8, §14.3): up
 * to `maxSpeed`; at faster speeds it writes open and close only, and the background job adds high
 * and low. Paused (`null`) counts as slow.
 */
export function liveHighLow(speed: SpeedId | null, maxSpeed: SpeedId): boolean {
  return (
    speed === null ||
    speedById(speed).gameSecondsPerSecond <= speedById(maxSpeed).gameSecondsPerSecond
  );
}
