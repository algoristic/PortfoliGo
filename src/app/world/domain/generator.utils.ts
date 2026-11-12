import { detLog } from '@app/simulation/util/det-math';
import { lognormal, uniform } from '@app/simulation/util/distributions';
import { RandomStream } from '@app/simulation/util/random-stream';

import { LognormalSpec, Range } from './models/world-config.model';
import { NameRegistry } from './name-logic';

const MAX_REDRAWS = 100;

/** Names, tickers and identifiers already handed out in this world. */
export interface GenerationRegistries {
  names: NameRegistry;
  tickers: Set<string>;
  isins: Set<string>;
}

export function createRegistries(): GenerationRegistries {
  return { names: new NameRegistry(), tickers: new Set(), isins: new Set() };
}

export function uniformIn(rng: RandomStream, range: Range): number {
  return uniform(rng, range[0], range[1]);
}

/** Lognormal draw inside `[min, max]`: redraws a few times, then clamps. */
export function lognormalIn(rng: RandomStream, spec: LognormalSpec): number {
  const mu = detLog(spec.median);
  let value = lognormal(rng, mu, spec.sigma);
  for (let i = 0; i < MAX_REDRAWS && (value < spec.min || value > spec.max); i++) {
    value = lognormal(rng, mu, spec.sigma);
  }
  return Math.min(spec.max, Math.max(spec.min, value));
}

/** Rounds to a grid of `1 / stepsPerUnit` (e.g. 2000 → 0.0005 = 0.05 percentage points). */
export function roundToGrid(value: number, stepsPerUnit: number): number {
  return Math.round(value * stepsPerUnit) / stepsPerUnit;
}

/** Splits `total` by weights with the largest remainder method (ties by position). */
export function allocateByLargestRemainder(total: number, weights: readonly number[]): number[] {
  let weightSum = 0;
  for (const weight of weights) {
    weightSum += weight;
  }
  const exact = weights.map((weight) => (total * weight) / weightSum);
  const counts = exact.map((value) => Math.floor(value));
  let assigned = 0;
  for (const count of counts) {
    assigned += count;
  }
  const order = exact
    .map((value, index) => ({ remainder: value - counts[index], index }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; i < total - assigned; i++) {
    counts[order[i].index]++;
  }
  return counts;
}
