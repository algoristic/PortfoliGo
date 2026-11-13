import {
  INDICATOR_KINDS,
  IndicatorKind,
  IndicatorPoint,
  IndicatorSpec,
  IndicatorTracker,
} from './models/indicator.model';
import { mean } from './statistics-logic';

/** Bounds of the period `n` (TS §11.7): whole numbers from 2 to 200. */
export const INDICATOR_PERIOD_MIN = 2;
export const INDICATOR_PERIOD_MAX = 200;

/** Multipliers `k` of the Bollinger bands (TS §11.7): 0.5 to 4 in steps of 0.5. */
export const BOLLINGER_MULTIPLIERS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4] as const;

/** Defaults when an indicator is added (TS §11.7). */
export const DEFAULT_INDICATOR_SPECS: Readonly<Record<IndicatorKind, IndicatorSpec>> = {
  sma: { kind: 'sma', period: 20 },
  ema: { kind: 'ema', period: 20 },
  smma: { kind: 'smma', period: 14 },
  bollinger: { kind: 'bollinger', period: 20, multiplier: 2 },
};

export function isIndicatorPeriod(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= INDICATOR_PERIOD_MIN &&
    (value as number) <= INDICATOR_PERIOD_MAX
  );
}

export function isBollingerMultiplier(value: unknown): value is number {
  return BOLLINGER_MULTIPLIERS.some((multiplier) => multiplier === value);
}

/** Type guard for stored indicators: a known kind with valid parameters and no others. */
export function isIndicatorSpec(value: unknown): value is IndicatorSpec {
  if (typeof value !== 'object' || value === null || !('kind' in value) || !('period' in value)) {
    return false;
  }
  const { kind, period } = value;
  if (!INDICATOR_KINDS.some((known) => known === kind) || !isIndicatorPeriod(period)) {
    return false;
  }
  const hasMultiplier = 'multiplier' in value;
  return kind === 'bollinger'
    ? hasMultiplier && isBollingerMultiplier(value.multiplier)
    : !hasMultiplier;
}

/** The smoothing factor α of EMA (`2 / (n + 1)`) and SMMA (`1 / n`, Wilder). */
export function smoothingFactor(kind: 'ema' | 'smma', period: number): number {
  return kind === 'ema' ? 2 / (period + 1) : 1 / period;
}

/** Population standard deviation (divisor `n`) around `center`. */
function populationDeviation(values: Float64Array, center: number): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const d = values[i] - center;
    sum += d * d;
  }
  return Math.sqrt(sum / values.length);
}

/**
 * SMA and Bollinger bands over the last `period` values. The window holds them oldest first, so
 * every point is summed in the same order however it was reached.
 */
class WindowTracker implements IndicatorTracker {
  readonly spec: IndicatorSpec;
  count = 0;
  readonly #window: Float64Array;

  constructor(spec: IndicatorSpec) {
    this.spec = spec;
    this.#window = new Float64Array(spec.period);
  }

  push(value: number): IndicatorPoint | null {
    const period = this.spec.period;
    if (this.count >= period) {
      this.#window.copyWithin(0, 1);
      this.#window[period - 1] = value;
    } else {
      this.#window[this.count] = value;
    }
    this.count++;
    return this.#point();
  }

  replaceLast(value: number): IndicatorPoint | null {
    if (this.count === 0) {
      return this.push(value);
    }
    this.#window[Math.min(this.count, this.spec.period) - 1] = value;
    return this.#point();
  }

  #point(): IndicatorPoint | null {
    if (this.count < this.spec.period) {
      return null;
    }
    const middle = mean(this.#window);
    if (this.spec.kind !== 'bollinger') {
      return [middle];
    }
    const band = this.spec.multiplier * populationDeviation(this.#window, middle);
    return [middle, middle + band, middle - band];
  }
}

/**
 * EMA and SMMA: the SMA of the first `period` values seeds the average, every later value moves it
 * by `α · x + (1 − α) · previous`. The tracker keeps the average before the newest value, so
 * `replaceLast` recomputes only the last step.
 */
class SmoothingTracker implements IndicatorTracker {
  readonly spec: IndicatorSpec;
  count = 0;
  readonly #alpha: number;
  readonly #seed: Float64Array;
  /** The average up to the value before the newest one (from `period + 1` values on). */
  #previous = Number.NaN;
  #current: number | null = null;

  constructor(spec: IndicatorSpec, kind: 'ema' | 'smma') {
    this.spec = spec;
    this.#alpha = smoothingFactor(kind, spec.period);
    this.#seed = new Float64Array(spec.period);
  }

  push(value: number): IndicatorPoint | null {
    if (this.#current !== null) {
      this.#previous = this.#current;
    }
    this.count++;
    return this.#step(value);
  }

  replaceLast(value: number): IndicatorPoint | null {
    if (this.count === 0) {
      return this.push(value);
    }
    return this.#step(value);
  }

  #step(value: number): IndicatorPoint | null {
    const period = this.spec.period;
    if (this.count <= period) {
      this.#seed[this.count - 1] = value;
      this.#current = this.count === period ? mean(this.#seed) : null;
    } else {
      this.#current = this.#alpha * value + (1 - this.#alpha) * this.#previous;
    }
    return this.#current === null ? null : [this.#current];
  }
}

export function createIndicatorTracker(spec: IndicatorSpec): IndicatorTracker {
  switch (spec.kind) {
    case 'ema':
    case 'smma':
      return new SmoothingTracker(spec, spec.kind);
    default:
      return new WindowTracker(spec);
  }
}

/**
 * The indicator at every value (TS §11.7), `null` before the first `period` values; for a new data
 * set, e.g. after older candles were prepended.
 */
export function indicatorSeries(
  values: ArrayLike<number>,
  spec: IndicatorSpec,
): (IndicatorPoint | null)[] {
  const tracker = createIndicatorTracker(spec);
  const points: (IndicatorPoint | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    points.push(tracker.push(values[i]));
  }
  return points;
}

/** Number of lines an indicator draws: one per moving average, three for Bollinger bands. */
export function indicatorLineCount(spec: IndicatorSpec): number {
  return spec.kind === 'bollinger' ? 3 : 1;
}
