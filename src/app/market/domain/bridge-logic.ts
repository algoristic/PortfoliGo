import { normal } from '../../simulation/util/distributions';
import { RandomStream } from '../../simulation/util/random-stream';

/**
 * Precomputed coefficients of a Brownian bridge over `n` minutes with relative variance weights
 * `w_0 … w_(n−1)` (TS §6.1), normalized to a total variance of 1.
 */
export interface BridgeTable {
  /** Number of minutes between the two support points. */
  length: number;
  /** `v_j / R_j` for j = 0 … n − 2. */
  ratio: Float64Array;
  /** `√(v_j · (R_j − v_j) / R_j)` for j = 0 … n − 2, for a total variance of 1. */
  noise: Float64Array;
}

/** Bridge table for the given weights per minute (all > 0). */
export function createBridgeTable(weights: ArrayLike<number>): BridgeTable {
  const length = weights.length;
  if (length < 1) {
    throw new RangeError('createBridgeTable: a bridge needs at least one minute');
  }
  let total = 0;
  for (let j = 0; j < length; j++) {
    if (!(weights[j] > 0)) {
      throw new RangeError(`createBridgeTable: weight ${weights[j]} is not positive`);
    }
    total += weights[j];
  }
  const remaining = new Float64Array(length);
  let sum = 0;
  for (let j = length - 1; j >= 0; j--) {
    sum += weights[j] / total;
    remaining[j] = sum;
  }
  const ratio = new Float64Array(Math.max(0, length - 1));
  const noise = new Float64Array(Math.max(0, length - 1));
  for (let j = 0; j < length - 1; j++) {
    const variance = weights[j] / total;
    const rest = remaining[j];
    ratio[j] = variance / rest;
    noise[j] = Math.sqrt(Math.max(0, (variance * (rest - variance)) / rest));
  }
  return { length, ratio, noise };
}

/** Bridge table with the same variance in every minute. */
export function createUniformBridgeTable(length: number): BridgeTable {
  return createBridgeTable(new Float64Array(length).fill(1));
}

/**
 * Weights per minute of a session of `length` minutes from a profile over equally long parts of
 * the session; minute j falls into part `⌊j · parts / length⌋`.
 */
export function profileWeights(profile: readonly number[], length: number): Float64Array {
  const weights = new Float64Array(length);
  for (let j = 0; j < length; j++) {
    weights[j] = profile[Math.floor((j * profile.length) / length)];
  }
  return weights;
}

/**
 * Brownian bridge from `start` to `end` with a total variance of `scale²` (TS §6.1). Writes
 * `out[offset … offset + n]`; the inner values come from `rng` (n − 1 normals), the end point is
 * set as support point and never computed from the bridge (TS §4.5, rule 8).
 */
export function fillBridge(
  out: Float64Array,
  offset: number,
  start: number,
  end: number,
  table: BridgeTable,
  scale: number,
  rng: RandomStream,
): void {
  const { length, ratio, noise } = table;
  let x = start;
  out[offset] = start;
  for (let j = 0; j < length - 1; j++) {
    x += ratio[j] * (end - x) + noise[j] * scale * normal(rng);
    out[offset + j + 1] = x;
  }
  out[offset + length] = end;
}
