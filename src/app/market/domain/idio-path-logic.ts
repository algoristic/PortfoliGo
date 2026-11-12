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
 * `m(t) = α·h(t) + z·t − ½·v·g(t)` with `h(t) = decayWeight(κ_α, t)`, the constant drift `z`
 * (zero-beta part `(1 − β)·r_z` of a share, trend of a factor) and `g(t) = decayWeight(2θ, t)`, so
 * that `E[e^{U}] = e^{α·h(t) + z·t}` up to second order (compensator of diffusion and jumps).
 */
export function expectedLogPath(
  alpha: number,
  alphaWeight: number,
  drift: number,
  years: number,
  variance: number,
  varianceWeight: number,
): number {
  return alpha * alphaWeight + drift * years - 0.5 * variance * varianceWeight;
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

/** Yield whose expected log markdown p. a. is `drag`: `f·(1 − e^{−ỹ/f})`, the inverse of `dividendDrag`. */
export function yieldFromDrag(drag: number, perYear: number): number {
  if (drag <= 0 || perYear <= 0) {
    return 0;
  }
  return perYear * (1 - detExp(-drag / perYear));
}

/**
 * Expected log markdown p. a. `d` years after the start of the payments (TS §6.5, E-33): it moves
 * from `ỹ_0` to the long-run `ỹ_∞` at the rate `κ_y`, `ỹ(d) = ỹ_∞ + (ỹ_0 − ỹ_∞)·e^{−κ_y·d}`.
 */
export function dividendDragAt(
  startDrag: number,
  longRunDrag: number,
  rate: number,
  years: number,
): number {
  return longRunDrag + (startDrag - longRunDrag) * detExp(-rate * years);
}

/**
 * Expected log markdown of the first `d` years of payments (TS §6.5, E-33):
 * `D(d) = ỹ_∞·d + (ỹ_0 − ỹ_∞)·decayWeight(κ_y, d)`, the integral of `dividendDragAt`; 0 before the
 * start (`d ≤ 0`).
 */
export function cumulativeDividendDrag(
  startDrag: number,
  longRunDrag: number,
  rate: number,
  years: number,
): number {
  if (years <= 0) {
    return 0;
  }
  return longRunDrag * years + (startDrag - longRunDrag) * decayWeight(rate, years);
}
