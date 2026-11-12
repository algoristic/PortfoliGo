const MS_PER_SECOND = 1000;

/**
 * Rate limit for the events of the worker host (TS §8.4): at most `maxPerSecond` sends in any
 * second of real time. A wall clock set back allows the next send at once, so a changed system
 * time never silences the UI.
 */
export class Throttle {
  readonly #intervalMs: number;
  #lastMs: number | null = null;

  constructor(maxPerSecond: number) {
    if (!(maxPerSecond > 0)) {
      throw new RangeError(`Throttle: maxPerSecond must be positive, got ${maxPerSecond}`);
    }
    this.#intervalMs = MS_PER_SECOND / maxPerSecond;
  }

  /** Whether a send at `nowMs` keeps the limit. */
  isDue(nowMs: number): boolean {
    return (
      this.#lastMs === null || nowMs < this.#lastMs || nowMs - this.#lastMs >= this.#intervalMs
    );
  }

  /** Records a send at `nowMs`. */
  sent(nowMs: number): void {
    this.#lastMs = nowMs;
  }
}
