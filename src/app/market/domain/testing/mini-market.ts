import { miniWorld, MiniWorld } from '@app/world/domain/testing/mini-world';

import { DEFAULT_MARKET_CONFIG } from '../default-market-config';
import { createMarketContext, MarketContext } from '../market-context';

export interface MiniMarket extends MiniWorld {
  context: MarketContext;
}

/** Market context of the mini world (`world/domain/testing/mini-world.ts`). */
export function miniMarket(seed = 'mini-1'): MiniMarket {
  const mini = miniWorld(seed);
  return { ...mini, context: createMarketContext(mini.seedKey, mini.world, DEFAULT_MARKET_CONFIG) };
}
