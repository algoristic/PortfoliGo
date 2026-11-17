import { MarketPhase } from './market-config.model';

/** Per-instrument part of the state that the day step advances (TS §6.4, §6.5). */
export interface InstrumentState {
  /** Idiosyncratic log component `U_i` per instrument at the last close. */
  idioClose: Float64Array;
  /** Transient part `T_i` of `U_i` per instrument at the last close (TS §6.4, E-22 new). */
  idioTransient: Float64Array;
  /** Log price per instrument at the last close; `c_i` before the first trading day. */
  logClose: Float64Array;
  /** Next scheduled ex-date per instrument, −1 without a dividend. */
  nextExDay: Int32Array;
  /**
   * Announced dividend per share for `nextExDay` in cents with two decimals (euros with four,
   * TS §6.5), `NaN` until the announcement.
   */
  dividendCents: Float64Array;
}

/**
 * Core state of the market between two day steps (TS §6.1). Arrays follow the order of the
 * `MarketLayout` and the `IndexLayout`. Caches and derived values never belong here.
 */
export interface MarketState extends InstrumentState {
  /** Next day index (days since the epoch) the day step will process. */
  day: number;
  phase: MarketPhase;
  /** Arithmetic trend `m_k` per factor, p. a. */
  trend: Float64Array;
  /** Log volatility `ln s_k` per factor, valid for the next trading day. */
  logVol: Float64Array;
  /** Cumulative log level `F_k` per factor at 24:00 of the last trading day. */
  level: Float64Array;
  /** Reinvestment factor `R` per index (TS §6.6) at the end of the last trading day. */
  indexReinvest: Float64Array;
  /** Scale `k` per ETF (TS §6.6): NAV = k · TR or k · I + pot; TER and tracking act on it daily. */
  etfScale: Float64Array;
  /** Distribution pot per distributing ETF in euros per fund share; 0 for accumulating ETFs. */
  etfPot: Float64Array;
  /** Next ex-date per distributing ETF, −1 for accumulating ETFs. */
  etfNextExDay: Int32Array;
}

/** Copy of the market state that shares no arrays with the running state. */
export type MarketSnapshot = Readonly<MarketState>;

/**
 * Complete market state at a month start (TS §6.8), so that every past day can be recomputed from
 * at most one month of day steps.
 */
export type FactorStateEntry = MarketSnapshot;

/** Market states at the start of every month since the epoch, ordered by day. */
export interface FactorHistory {
  monthStarts: FactorStateEntry[];
}
