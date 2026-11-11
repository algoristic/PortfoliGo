import { MarketPhase } from './market-config.model';

/**
 * Core state of the market between two day steps (TS §6.1). Arrays follow the order of the
 * `MarketLayout`. Caches and derived values never belong here.
 */
export interface MarketState {
  /** Next day index (days since the epoch) the day step will process. */
  day: number;
  phase: MarketPhase;
  /** Arithmetic trend `m_k` per factor, p. a. */
  trend: Float64Array;
  /** Log volatility `ln s_k` per factor, valid for the next trading day. */
  logVol: Float64Array;
  /** Cumulative log level `F_k` per factor at 24:00 of the last trading day. */
  level: Float64Array;
  /** Idiosyncratic log component `U_i` per instrument at the last close. */
  idioClose: Float64Array;
}

/** Copy of the market state that shares no arrays with the running state. */
export type MarketSnapshot = Readonly<MarketState>;

/** Factor part of the market state, kept at every month start (TS §6.8). */
export interface FactorStateEntry {
  day: number;
  phase: MarketPhase;
  trend: Float64Array;
  logVol: Float64Array;
  level: Float64Array;
}

/** Factor states at the start of every month since the epoch, ordered by day. */
export interface FactorHistory {
  monthStarts: FactorStateEntry[];
}
