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
  /** Log price of the previous close (`c_i` before the first trading day). */
  prevLogClose: Float64Array;
  /** `U_i` at the previous close; with the factor bridges it gives the indicative value. */
  prevIdioClose: Float64Array;
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
  /** Dividend in cents per instrument whose ex-date is this day (markdown at the open), else 0. */
  exDividendCents: Float64Array;
  /** Dividend in cents announced this day and its ex-date; 0 and −1 without an announcement. */
  announcedCents: Float64Array;
  announcedExDay: Int32Array;
  /**
   * Reinvestment factor `R` of index x from boundary j on (`x · boundaryCount + j`, TS §6.6). It
   * rises at the open of a constituent's exchange on its ex-date.
   */
  indexReinvest: Float64Array;
  /**
   * Dividend points `Σ n_i · D_i / Div` of the constituents of index x that go ex at the open of
   * boundary j (`x · boundaryCount + j`), else 0.
   */
  indexDividendPoints: Float64Array;
  /** Scale `k` per ETF for the whole day (TS §6.6). */
  etfScale: Float64Array;
  /** Distribution pot of ETF e from boundary j on (`e · boundaryCount + j`), in euros per share. */
  etfPot: Float64Array;
  /** Distribution in cents per ETF whose ex-date is this day (at the ETF's open), else 0. */
  etfExCents: Float64Array;
}
