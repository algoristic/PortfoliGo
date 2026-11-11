import { MarketPhase } from './market-config.model';

/**
 * Support points of one trading day, fixed by the day step at 00:00 (TS §6.1). Minute values in
 * between are bridges (AP 1.5). Contains the closing prices of the day, so it stays internal to
 * the engine (TS §4.5, rule 7).
 */
export interface MarketDay {
  /** Day index (days since the epoch). */
  day: number;
  phase: MarketPhase;
  /** Factor level `F_k` at every boundary of the layout: index `k · boundaryCount + j`. */
  factorLevels: Float64Array;
  /** Factor volatility `s_k` of this day, p. a. */
  factorVols: Float64Array;
  /** Idiosyncratic component `U_i` at the open and at the close (including the jumps). */
  idioOpen: Float64Array;
  idioClose: Float64Array;
  /** Log price `c_i + Σ β_ik · F_k + U_i` at the open and at the close (before the price floor). */
  logOpen: Float64Array;
  logClose: Float64Array;
  /** Jumps of instrument i: entries `jumpStart[i] … jumpStart[i] + jumpCount[i] − 1`. */
  jumpStart: Int32Array;
  jumpCount: Int32Array;
  /** Minute of the game day, `open < minute ≤ close`, ascending per instrument. */
  jumpMinute: Int32Array;
  /** Log jump size. */
  jumpSize: Float64Array;
  /** Number of used jump entries. */
  jumpTotal: number;
}
