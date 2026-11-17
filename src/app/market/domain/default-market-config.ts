import { FactorParams, MarketConfig } from './models/market-config.model';

const SUB_FACTOR: Omit<FactorParams, 'volTarget' | 'trendVol'> = {
  trendTarget: 0,
  trendReversion: 0.5,
  volReversion: 8,
  volOfVol: 1,
  leverage: -0.5,
  levelReversion: Math.LN2 / 7,
  phaseCoupling: 0,
};

/**
 * Standard market (TS §6.2, §6.3), calibrated in AP 1.9c against the targets of TS §6.9 on
 * `calib-1` … `calib-5`.
 */
export const DEFAULT_MARKET_CONFIG: MarketConfig = {
  tradingDaysPerYear: 261,
  referencePhase: 'normal',
  // Volatility targets of the world factor per phase; a business cycle normal → downturn → crisis
  // → recovery, so that the stationary shares are 40 / 35 / 17 / 8 % (TS §6.3).
  phases: {
    boom: {
      meanDuration: 3.5,
      trendTarget: 0.1,
      volTarget: 0.074,
      next: { boom: 0, normal: 0.35, downturn: 0.35, crisis: 0.3 },
    },
    normal: {
      meanDuration: 2,
      trendTarget: 0.08,
      volTarget: 0.093,
      next: { boom: 0.1, normal: 0, downturn: 0.75, crisis: 0.15 },
    },
    downturn: {
      meanDuration: 1,
      trendTarget: 0.03,
      volTarget: 0.127,
      next: { boom: 0.05, normal: 0.15, downturn: 0, crisis: 0.8 },
    },
    crisis: {
      meanDuration: 0.4,
      trendTarget: -0.05,
      volTarget: 0.29,
      next: { boom: 0.45, normal: 0.55, downturn: 0, crisis: 0 },
    },
  },
  factors: {
    world: {
      trendTarget: 0.08,
      trendReversion: 3,
      trendVol: 0.07,
      volTarget: 0.093,
      volReversion: 8,
      volOfVol: 1.45,
      leverage: -0.6,
      levelReversion: 0,
      phaseCoupling: 1,
    },
    region: { ...SUB_FACTOR, trendVol: 0.03, volTarget: 0.09, phaseCoupling: 0.4 },
    sector: { ...SUB_FACTOR, trendVol: 0.03, volTarget: 0.1 },
    industry: { ...SUB_FACTOR, trendVol: 0.04, volTarget: 0.06 },
    style: { ...SUB_FACTOR, trendVol: 0.02, volTarget: 0.04 },
    // Small-cap premium of 1.5 % p. a. (decision of the product owner, AP 1.9c).
    size: { ...SUB_FACTOR, trendTarget: 0.015, trendVol: 0.02, volTarget: 0.04 },
  },
  overnightShare: 0.25,
  // E-22 new (AP 7.3d): a fifth of the diffusion variance of U_i is transient and returns with a
  // half-life of 10 years; the rest is a random walk. Start values, tuned in AP 7.3e.
  idioReversion: Math.LN2 / 10,
  idioTransientShare: 0.2,
  // Damped coupling of the idiosyncratic volatility to the world factor (7.1b-02).
  idioVolCoupling: 0.5,
  alphaDecay: Math.LN2 / 7,
  zeroBetaReturn: 0.05,
  closedActivity: 0,
  regionClosedActivity: 0.015,
  // Roughly the market capitalisation of the standard world (TS §5.2), with more weight on the
  // trading hours of Asia-Pacific, so that their indices don't open with most of the day's move.
  exchangeActivity: {
    'exc-us': 0.4,
    'exc-ca': 0.045,
    'exc-de': 0.085,
    'exc-fr': 0.065,
    'exc-gb': 0.085,
    'exc-ch': 0.035,
    'exc-nl': 0.035,
    'exc-jp': 0.1,
    'exc-au': 0.04,
    'exc-hk': 0.05,
    'exc-in': 0.03,
    'exc-br': 0.03,
  },
  dividendLifecycle: {
    longRunYield: 0.025,
    yieldReversion: Math.LN2 / 12,
    initialYield: 0.01,
  },
  priceFloor: 0.01,
  // Idiosyncratic variance per 13th of the session: four times the midday level in the first,
  // 2.5 times in the last part (TS §6.1).
  intradayVolProfile: [4, 2, 1.4, 1.1, 1, 1, 1, 1, 1, 1.1, 1.3, 1.6, 2.5],
  etfTrackingError: { 'physical-full': 0.0005, 'physical-sampling': 0.002, synthetic: 0.0003 },
  spreads: {
    base: {
      large: [0.0005, 0.001],
      mid: [0.001, 0.0025],
      small: [0.0025, 0.01],
      etf: [0.0005, 0.003],
    },
    maxVolFactor: 3,
    closedUnderlyingFactor: 1.75,
  },
};
