import { detExp, detLog } from '@app/simulation/util/det-math';

/** Below this rate the weights use the limit for a vanishing rate (TS §6.4). */
const MIN_RATE = 1e-12;

/**
 * `(1 − e^{−r·t}) / r` after `t` years at the rate `r` p. a.; `t` for `r = 0` (TS §6.4). With
 * `r = κ_α` it weights the decaying alpha, with `r = 2θ` the variance of a reverting log level.
 */
export function decayWeight(rate: number, years: number): number {
  if (rate < MIN_RATE) {
    return years;
  }
  return (1 - detExp(-rate * years)) / rate;
}

/**
 * Expected log path of a reverting log level without dividends (TS §6.4):
 * `m(t) = α·h(t) − ½·v·g(t)` with `h(t) = decayWeight(κ_α, t)` and `g(t) = decayWeight(2θ, t)`,
 * so that `E[e^{U}] = e^{α·h(t)}` up to second order (compensator of diffusion and jumps).
 */
export function expectedLogPath(
  alpha: number,
  alphaWeight: number,
  variance: number,
  varianceWeight: number,
): number {
  return alpha * alphaWeight - 0.5 * variance * varianceWeight;
}

/** Variance p. a. of the idiosyncratic part: `σ² + λ·(μ_J² + σ_J²)` (diffusion and jumps). */
export function idioVariance(
  vol: number,
  jumpIntensity: number,
  jumpMean: number,
  jumpSd: number,
): number {
  return vol * vol + jumpIntensity * (jumpMean * jumpMean + jumpSd * jumpSd);
}

/**
 * Expected log markdown of the dividends p. a. (TS §6.4): `−f·ln(1 − y/f)` for yield `y` and
 * `f` payments per year; 0 without a dividend.
 */
export function dividendDrag(dividendYield: number, perYear: number): number {
  if (dividendYield <= 0 || perYear <= 0) {
    return 0;
  }
  return -perYear * detLog(1 - dividendYield / perYear);
}
