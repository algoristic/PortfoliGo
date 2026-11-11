import { DEFAULT_MARKET_CONFIG } from './default-market-config';
import { createMarketContext, MarketContext } from './market-context';
import { createFactorHistory } from './market-history';
import { advanceMarket, createMarketState } from './market-step';
import { MarketConfig } from './models/market-config.model';
import { MarketDay } from './models/market-day.model';
import { FactorHistory, MarketState } from './models/market-state.model';

import { dayIndex, GAME_START_TICK } from '../../clock/domain/calendar-logic';
import { SeedKey } from '../../simulation/util/seed';
import { World } from '../../world/domain/models/world.model';

export interface Prehistory {
  context: MarketContext;
  /** Market state at the game start (00:00 of the first game day). */
  state: MarketState;
  history: FactorHistory;
}

/**
 * Prehistory from the epoch to the game start with the same day steps as the game; there is no
 * special procedure (TS §6.8). `onDay` receives every market day (reused buffer).
 */
export function runPrehistory(
  seedKey: SeedKey,
  world: World,
  config: MarketConfig = DEFAULT_MARKET_CONFIG,
  onDay?: (day: Readonly<MarketDay>) => void,
): Prehistory {
  const context = createMarketContext(seedKey, world, config);
  const state = createMarketState(context);
  const history = createFactorHistory();
  advanceMarket(context, state, dayIndex(GAME_START_TICK), { onDay, history });
  return { context, state, history };
}
