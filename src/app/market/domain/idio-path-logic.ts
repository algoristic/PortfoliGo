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
 * Expected log path of a log level without dividends (TS §6.2, §6.4):
 * `m(t) = α·h(t) + z·t − ½·v·g(t)` with `h(t) = decayWeight(κ_α, t)`, the constant drift `z` and
 * `g(t) = decayWeight(2θ, t)`, so that `E[e^{X}] = e^{α·h(t) + z·t}` up to second order. A factor
 * passes its trend as `z`; the permanent part of `U_i` passes `g = t` (no return), the transient
 * part `α = z = 0` (TS §6.4, E-22 new).
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

/** Variances p. a. of the idiosyncratic part `U_i` at the mean volatility (TS §6.4, E-22 new). */
export interface IdioVariances {
  /** Permanent diffusion `(1 − w)·σ²`. */
  permanent: number;
  /** Transient part `v_T = w·σ²`. */
  transient: number;
  /** Jumps `λ·(μ_J² + σ_J²)`; they are permanent. */
  jumps: number;
}

/**
 * Splits the idiosyncratic variance p. a. (TS §6.4, E-22 new): the share `w` of the diffusion
 * variance `σ²` is transient, the rest of the diffusion and the jumps are permanent.
 */
export function idioVariances(
  vol: number,
  transientShare: number,
  jumpIntensity: number,
  jumpMean: number,
  jumpSd: number,
): IdioVariances {
  const diffusion = vol * vol;
  return {
    permanent: (1 - transientShare) * diffusion,
    transient: transientShare * diffusion,
    jumps: jumpIntensity * (jumpMean * jumpMean + jumpSd * jumpSd),
  };
}

/** Weights of the overnight and the session shock in the transient shock of a day (TS §6.4). */
export interface TransientShockWeights {
  overnight: number;
  session: number;
}

/**
 * Splits the two daily shocks of `U_i` into a permanent and a transient part without another draw
 * (TS §6.4, E-22 new): with `u = (√o, √(1 − o))` (overnight and session weights of `U_i`) and
 * `u⊥ = (−√(1 − o), √o)`, the transient part takes `t = w·u − √(w·(1 − w))·u⊥` and the permanent part
 * `u − t`. Both are orthogonal with `|t|² = w` and `|u − t|² = 1 − w`, so they are independent
 * with the variance shares `w` and `1 − w`, and `U_i` keeps its shocks.
 */
export function transientShockWeights(
  overnightShare: number,
  transientShare: number,
): TransientShockWeights {
  const overnight = Math.sqrt(overnightShare);
  const session = Math.sqrt(1 - overnightShare);
  const cross = Math.sqrt(transientShare * (1 - transientShare));
  return {
    overnight: transientShare * overnight + cross * session,
    session: transientShare * session - cross * overnight,
  };
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
