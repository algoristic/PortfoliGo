import { DEFAULT_WORLD_CONFIG } from '@app/world/domain/default-world-config';

import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { FACTOR_KINDS } from './models/market-config.model';

describe('DEFAULT_MARKET_CONFIG', () => {
  it('matches the factor volatilities that the world assumes for the risk classes', () => {
    // TS §5.4: the world mirrors the volatility targets of the reference phase, so that a
    // recalibration of the market moves the risk classes with it.
    const { riskClassFactorVols } = DEFAULT_WORLD_CONFIG.companies;
    for (const kind of FACTOR_KINDS) {
      expect(riskClassFactorVols[kind], kind).toBe(DEFAULT_MARKET_CONFIG.factors[kind].volTarget);
    }
  });
});
