export const MARKET_PHASES = ['boom', 'normal', 'downturn', 'crisis'] as const;
export type MarketPhase = (typeof MARKET_PHASES)[number];

export const FACTOR_KINDS = ['world', 'region', 'sector', 'industry', 'style', 'size'] as const;
export type FactorKind = (typeof FACTOR_KINDS)[number];

/** Market phase of the Markov chain (TS §6.3); rates p. a. */
export interface MarketPhaseParams {
  /** Mean duration in years; the daily probability to leave is 1 / (duration × trading days). */
  meanDuration: number;
  /** Arithmetic trend target of the world factor. */
  trendTarget: number;
  /** Volatility target of the world factor. */
  volTarget: number;
  /** Relative weights of the next phase when the phase changes; the own weight is ignored. */
  next: Readonly<Record<MarketPhase, number>>;
}

/** Dynamics of a factor class (TS §6.2); rates p. a. */
export interface FactorParams {
  /** Trend target `m̄` in the reference phase. */
  trendTarget: number;
  /** Mean reversion speed `κ_m` of the trend. */
  trendReversion: number;
  /** Volatility `η` of the trend. */
  trendVol: number;
  /** Volatility target `s̄` in the reference phase. */
  volTarget: number;
  /** Mean reversion speed `κ_s` of the log volatility. */
  volReversion: number;
  /** Volatility `ξ` of the log volatility. */
  volOfVol: number;
  /** Correlation `ρ < 0` between daily return and volatility change (leverage effect). */
  leverage: number;
  /**
   * How strongly the phase moves the targets: `m̄ = trendTarget + c · (m̄_phase − m̄_ref)` and
   * `s̄ = volTarget · (1 + c · (s̄_phase / s̄_ref − 1))`.
   */
  phaseCoupling: number;
}

/** Parameters of the market model; start values for the calibration in AP 1.9. */
export interface MarketConfig {
  tradingDaysPerYear: number;
  /** Phase at the epoch; its targets are the reference for the phase coupling. */
  referencePhase: MarketPhase;
  phases: Readonly<Record<MarketPhase, MarketPhaseParams>>;
  factors: Readonly<Record<FactorKind, FactorParams>>;
  /** Share of the idiosyncratic daily variance in the overnight shock (TS §6.4). */
  overnightShare: number;
  /** Lowest price in euros (TS §6.4). */
  priceFloor: number;
}
