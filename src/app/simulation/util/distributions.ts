import { detExp, detLog } from './det-math';
import { RandomStream } from './random-stream';

const TWO_POW_32 = 4294967296;

/** Largest λ for which `poisson` uses plain inversion (e^-λ stays far from underflow). */
export const POISSON_MAX_LAMBDA = 30;

/** Uniform in [min, max). */
export function uniform(rng: RandomStream, min: number, max: number): number {
  return min + (max - min) * rng.nextFloat53();
}

/** Uniform integer in [min, max] (both inclusive, at most 2³² values), without modulo bias. */
export function uniformInt(rng: RandomStream, min: number, max: number): number {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max < min) {
    throw new RangeError(`uniformInt: invalid range [${min}, ${max}]`);
  }
  const range = max - min + 1;
  if (range > TWO_POW_32) {
    throw new RangeError(`uniformInt: range ${range} exceeds 2^32`);
  }
  const limit = TWO_POW_32 - (TWO_POW_32 % range);
  let value = rng.nextUint32();
  while (value >= limit) {
    value = rng.nextUint32();
  }
  return min + (value % range);
}

/** Normal distribution via the Marsaglia polar method; every second call uses the cached spare. */
export function normal(rng: RandomStream, mean = 0, sd = 1): number {
  const spare = rng.normalSpare;
  if (spare !== null) {
    rng.normalSpare = null;
    return mean + sd * spare;
  }
  let u: number;
  let v: number;
  let s: number;
  do {
    u = 2 * rng.nextFloat53() - 1;
    v = 2 * rng.nextFloat53() - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  const factor = Math.sqrt((-2 * detLog(s)) / s);
  rng.normalSpare = v * factor;
  return mean + sd * u * factor;
}

/** Lognormal distribution: `exp(N(mu, sigma))`. */
export function lognormal(rng: RandomStream, mu: number, sigma: number): number {
  return detExp(normal(rng, mu, sigma));
}

/**
 * Poisson distribution by inversion (sequential search), for 0 ≤ λ ≤ `POISSON_MAX_LAMBDA`.
 * Callers that draw often with the same λ may pass `detExp(-lambda)` precomputed.
 */
export function poisson(rng: RandomStream, lambda: number, expMinusLambda?: number): number {
  if (!(lambda >= 0 && lambda <= POISSON_MAX_LAMBDA)) {
    throw new RangeError(`poisson: lambda ${lambda} outside [0, ${POISSON_MAX_LAMBDA}]`);
  }
  const u = rng.nextFloat53();
  let k = 0;
  let p = expMinusLambda ?? detExp(-lambda);
  let cumulative = p;
  // p reaches 0 long before k overflows; the check ends the loop if rounding keeps F below u.
  while (u >= cumulative && p > 0) {
    k++;
    p = (p * lambda) / k;
    cumulative += p;
  }
  return k;
}

/** Index drawn with probability proportional to its weight (non-negative, finite, sum > 0). */
export function weightedIndex(rng: RandomStream, weights: readonly number[]): number {
  let total = 0;
  let last = -1;
  for (let i = 0; i < weights.length; i++) {
    const weight = weights[i];
    if (!(weight >= 0) || weight === Infinity) {
      throw new RangeError(`weightedIndex: invalid weight ${weight} at ${i}`);
    }
    total += weight;
    if (weight > 0) {
      last = i;
    }
  }
  if (last < 0) {
    throw new RangeError('weightedIndex: weights must contain a positive value');
  }
  const target = rng.nextFloat53() * total;
  let cumulative = 0;
  for (let i = 0; i < last; i++) {
    cumulative += weights[i];
    if (target < cumulative) {
      return i;
    }
  }
  return last;
}

/** Shuffles the array in place (Fisher–Yates) and returns it. */
export function shuffle<T>(rng: RandomStream, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = uniformInt(rng, 0, i);
    const item = items[i];
    items[i] = items[j];
    items[j] = item;
  }
  return items;
}

export function pick<T>(rng: RandomStream, items: readonly T[]): T {
  if (items.length === 0) {
    throw new RangeError('pick: empty array');
  }
  return items[uniformInt(rng, 0, items.length - 1)];
}
