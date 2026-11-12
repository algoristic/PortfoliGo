import { EtfReplication } from '@app/world/domain/models/etf.model';
import { SizeClass } from '@app/world/domain/models/taxonomy.model';

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
   * Speed `θ` p. a. at which the level returns to its expected path `m̄·t − ½·s̄²·g(t)` (TS §6.2,
   * E-22); 0 = none (world factor).
   */
  levelReversion: number;
  /**
   * How strongly the phase moves the targets: `m̄ = trendTarget + c · (m̄_phase − m̄_ref)` and
   * `s̄ = volTarget · (1 + c · (s̄_phase / s̄_ref − 1))`.
   */
  phaseCoupling: number;
}

/** Lower and upper bound of a range. */
export type MarketRange = readonly [number, number];

/** Spread model (TS §6.7); relative spreads (0.001 = 0.1 %). */
export interface SpreadParams {
  /** Base spread per size class and for ETFs; larger instruments get the lower end. */
  base: Readonly<Record<SizeClass | 'etf', MarketRange>>;
  /**
   * Upper bound of the volatility factor `s_world / s̄_world` (TS §6.7, E-23); the lower bound
   * is 1.
   */
  maxVolFactor: number;
  /** Multiplier when the whole underlying is closed; partly closed scales linearly. */
  closedUnderlyingFactor: number;
}

/** Dividend lifecycle (TS §6.5, E-33); rates p. a. */
export interface DividendLifecycleParams {
  /** Yield that the target yields of all companies approach over decades. */
  longRunYield: number;
  /** Speed `κ_y` at which the expected log markdown approaches that of `longRunYield`. */
  yieldReversion: number;
  /** Target yield of a company that starts to pay after the epoch, at its first payment. */
  initialYield: number;
}

/** Parameters of the market model; `DEFAULT_MARKET_CONFIG` is calibrated in AP 1.9c (TS §6.9). */
export interface MarketConfig {
  tradingDaysPerYear: number;
  /** Phase at the epoch; its targets are the reference for the phase coupling. */
  referencePhase: MarketPhase;
  phases: Readonly<Record<MarketPhase, MarketPhaseParams>>;
  factors: Readonly<Record<FactorKind, FactorParams>>;
  /** Share of the idiosyncratic daily variance in the overnight shock (TS §6.4). */
  overnightShare: number;
  /** Speed `θ` p. a. at which `U_i` returns to its expected path (TS §6.4, E-22); 0 = none. */
  idioReversion: number;
  /** Rate `κ_α` p. a. at which the alpha of a share decays (TS §6.4, E-22); 0 = permanent. */
  alphaDecay: number;
  /**
   * Zero-beta return `r_z` p. a. (TS §6.4, E-32): the expected log path of a share grows by
   * `(1 − β) · r_z` on top of `β` times the world factor, so beta moves the long-run growth only by
   * `β · (world drift − r_z)`.
   */
  zeroBetaReturn: number;
  /**
   * Activity of the factors while no exchange trades, relative to all exchanges trading (TS §6.2,
   * E-24); 1 spreads the factor variance evenly over the day.
   */
  closedActivity: number;
  /**
   * Activity of a region factor while none of the exchanges of its region trades, relative to all
   * of them trading (TS §6.2, E-30); 1 spreads its variance evenly over the day.
   */
  regionClosedActivity: number;
  /**
   * Relative weight of each exchange in the factor activity (E-24), by exchange id; missing
   * exchanges count 0. Fixed per configuration, so new companies do not move the factors.
   */
  exchangeActivity: Readonly<Record<string, number>>;
  dividendLifecycle: DividendLifecycleParams;
  /** Lowest price in euros (TS §6.4). */
  priceFloor: number;
  /**
   * Intraday profile of the idiosyncratic variance (TS §6.1): relative weights over equally long
   * parts of the session, e.g. `[2, 1, 1, 2]` for more movement at the open and close. It shapes
   * the minute bridges only; the support points stay unchanged. `[1]` is uniform.
   */
  intradayVolProfile: readonly number[];
  /** Tracking error p. a. per replication (TS §6.6): daily noise on the ETF scale `k`. */
  etfTrackingError: Readonly<Record<EtfReplication, number>>;
  spreads: SpreadParams;
}
