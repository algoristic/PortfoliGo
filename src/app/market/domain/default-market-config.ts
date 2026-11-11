import { FactorParams, MarketConfig } from './models/market-config.model';

const SUB_FACTOR: Omit<FactorParams, 'volTarget' | 'trendVol'> = {
  trendTarget: 0,
  trendReversion: 0.5,
  volReversion: 8,
  volOfVol: 1,
  leverage: -0.5,
  phaseCoupling: 0,
};

/** Standard market (TS §6.2, §6.3). Start values for the calibration in AP 1.9. */
export const DEFAULT_MARKET_CONFIG: MarketConfig = {
  tradingDaysPerYear: 261,
  referencePhase: 'normal',
  phases: {
    boom: {
      meanDuration: 3.5,
      trendTarget: 0.16,
      volTarget: 0.12,
      next: { boom: 0, normal: 0.7, downturn: 0.25, crisis: 0.05 },
    },
    normal: {
      meanDuration: 2,
      trendTarget: 0.1,
      volTarget: 0.15,
      next: { boom: 0.5, normal: 0, downturn: 0.4, crisis: 0.1 },
    },
    downturn: {
      meanDuration: 1,
      trendTarget: 0.01,
      volTarget: 0.2,
      next: { boom: 0.2, normal: 0.5, downturn: 0, crisis: 0.3 },
    },
    crisis: {
      meanDuration: 0.4,
      trendTarget: -0.25,
      volTarget: 0.35,
      next: { boom: 0.2, normal: 0.4, downturn: 0.4, crisis: 0 },
    },
  },
  factors: {
    world: {
      trendTarget: 0.1,
      trendReversion: 3,
      trendVol: 0.07,
      volTarget: 0.15,
      volReversion: 8,
      volOfVol: 1,
      leverage: -0.6,
      phaseCoupling: 1,
    },
    region: { ...SUB_FACTOR, trendVol: 0.03, volTarget: 0.06, phaseCoupling: 0.5 },
    sector: { ...SUB_FACTOR, trendVol: 0.03, volTarget: 0.06 },
    industry: { ...SUB_FACTOR, trendVol: 0.04, volTarget: 0.06 },
    style: { ...SUB_FACTOR, trendVol: 0.02, volTarget: 0.04 },
    size: { ...SUB_FACTOR, trendVol: 0.02, volTarget: 0.04 },
  },
  overnightShare: 0.25,
  priceFloor: 0.01,
  intradayVolProfile: [1],
};
