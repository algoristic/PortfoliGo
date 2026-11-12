import { DEFAULT_MARKET_CONFIG } from '@app/market/domain/default-market-config';
import { createMarketContext, MarketContext } from '@app/market/domain/market-context';
import { MarketConfig } from '@app/market/domain/models/market-config.model';
import { etfSeries, indexSeries, totalReturnSeries } from '@app/market/domain/series';
import { SeedKey } from '@app/simulation/util/seed';
import { World } from '@app/world/domain/models/world.model';

import { ExchangeSessions, GameWorld } from './models/game-world.model';

/** Static world of a game: the generated world, its market context and the exchange sessions. */
export function createGameWorld(
  seedKey: SeedKey,
  world: World,
  config: MarketConfig = DEFAULT_MARKET_CONFIG,
): GameWorld {
  const context = createMarketContext(seedKey, world, config);
  return { seedKey, world, context, exchanges: exchangeSessions(world, context) };
}

function exchangeSessions(world: World, context: MarketContext): ExchangeSessions[] {
  const { layout, indices } = context;
  const sessions = world.exchanges.map((exchange) => ({
    id: exchange.id,
    open: exchange.open,
    close: exchange.close,
    stocks: [] as number[],
    etfs: [] as number[],
    closingSeries: [] as number[],
  }));
  const position = (exchangeId: string): number => {
    const x = world.exchanges.findIndex((exchange) => exchange.id === exchangeId);
    if (x < 0) {
      throw new Error(`createGameWorld: unknown exchange ${exchangeId}`);
    }
    return x;
  };
  world.companies.forEach((company, i) => {
    const session = sessions[position(company.exchangeId)];
    session.stocks.push(i);
    session.closingSeries.push(i);
  });
  indices.ids.forEach((_id, x) => {
    const close = layout.boundaries[indices.closeBoundary[x]];
    const session = sessions.find((candidate) => candidate.close === close);
    if (session === undefined) {
      throw new Error(`createGameWorld: no exchange closes when index ${indices.ids[x]} closes`);
    }
    session.closingSeries.push(indexSeries(context, x), totalReturnSeries(context, x));
  });
  world.etfs.forEach((etf, e) => {
    const session = sessions[position(etf.exchangeId)];
    session.etfs.push(e);
    session.closingSeries.push(etfSeries(context, e));
  });
  for (const session of sessions) {
    session.closingSeries.sort((a, b) => a - b);
  }
  return sessions;
}
