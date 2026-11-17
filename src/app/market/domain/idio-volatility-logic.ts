import { detExp, detLog } from '@app/simulation/util/det-math';

/** Iterations of the lazy power method; the phase chain converges in far fewer. */
const STATIONARY_ITERATIONS = 2000;

/**
 * Stationary time shares of the market phases (TS §6.3): `leave[p]` is the daily probability to
 * leave phase p, `next[p][q]` the weight of q as the next phase. The jump chain `ν = ν·N` is solved
 * with the lazy power method `ν ← ½·(ν + ν·N)` (only exact operations); the time shares are
 * `ν_p / leave[p]`, normalised.
 */
export function stationaryPhaseShares(
  leave: ArrayLike<number>,
  next: readonly (readonly number[])[],
): number[] {
  const count = leave.length;
  const transition = next.map((weights) => {
    let total = 0;
    for (const weight of weights) {
      total += weight;
    }
    return weights.map((weight) => weight / total);
  });
  let jump = new Array<number>(count).fill(1 / count);
  for (let n = 0; n < STATIONARY_ITERATIONS; n++) {
    const following = jump.map((share) => share / 2);
    for (let p = 0; p < count; p++) {
      for (let q = 0; q < count; q++) {
        following[q] += (jump[p] * transition[p][q]) / 2;
      }
    }
    jump = following;
  }
  const time = jump.map((share, p) => share / leave[p]);
  let total = 0;
  for (const share of time) {
    total += share;
  }
  return time.map((share) => share / total);
}

/**
 * Stationary mean of `(s / s̄)^{2φ}` for the world factor volatility `s` (TS §6.4, 7.1b-02): per
 * phase p its target ratio `r_p = s̄_p / s̄` and a log-normal spread with the variance
 * `V = ξ² / (2κ_s)` of `ln s` around the target, `Σ_p π_p · r_p^{2φ} · e^{2φ²·V}`. The scale of a
 * day divides by it, so the idiosyncratic variance keeps its mean.
 */
export function idioVolNormalization(
  shares: readonly number[],
  volRatios: readonly number[],
  logVolVariance: number,
  coupling: number,
): number {
  let total = 0;
  for (let p = 0; p < shares.length; p++) {
    total += shares[p] * detExp(2 * coupling * detLog(volRatios[p]));
  }
  return total * detExp(2 * coupling * coupling * logVolVariance);
}

/**
 * Factor on the idiosyncratic volatility of a day (TS §6.4, 7.1b-02):
 * `√((s / s̄)^{2φ} / M)` for the world factor volatility `s` of the day, its reference `s̄`, the
 * exponent `φ` and the normalisation `M`; 1 for `φ = 0`.
 */
export function idioVolScale(
  worldVol: number,
  referenceVol: number,
  coupling: number,
  normalization: number,
): number {
  if (coupling === 0) {
    return 1;
  }
  return Math.sqrt(detExp(2 * coupling * detLog(worldVol / referenceVol)) / normalization);
}
