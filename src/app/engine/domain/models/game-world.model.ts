import { MarketContext } from '@app/market/domain/market-context';
import { SeedKey } from '@app/simulation/util/seed';
import { World } from '@app/world/domain/models/world.model';

/** Trading session of one exchange with the series that belong to it (TS §3.3, §3.8). */
export interface ExchangeSessions {
  id: string;
  /** Trading hours as minutes of the game day. */
  open: number;
  close: number;
  /** Shares listed on the exchange (instrument index = series index). */
  stocks: readonly number[];
  /** ETFs listed on the exchange (index in the `EtfLayout`). */
  etfs: readonly number[];
  /**
   * Series whose trading day ends with this session, ascending: the shares and ETFs of the
   * exchange and the price and total return indices whose session ends at the same minute. An
   * index belongs to the first exchange in world order with that closing minute, so every series
   * closes exactly once per trading day.
   */
  closingSeries: readonly number[];
}

/**
 * Static part of a game (TS §8.1): everything that follows from the seed and never changes. It is
 * regenerated on every load and never stored (TS §9.1).
 */
export interface GameWorld {
  seedKey: SeedKey;
  world: World;
  context: MarketContext;
  /** One entry per exchange in world order. */
  exchanges: readonly ExchangeSessions[];
}
