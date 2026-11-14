import { TradingHours } from '@app/clock/domain/models/time.model';
import { etfSeries, seriesIds } from '@app/market/domain/series';

import { GameWorld } from './models/game-world.model';

/** Series and trading hours of the instruments, shared by orders and savings plans (TS §3.3). */
export interface InstrumentSessions {
  /** Instrument ID → series. */
  series: ReadonlyMap<string, number>;
  /** Trading hours per series; `null` for indices, which are not tradable. */
  hours: readonly (TradingHours | null)[];
}

export function instrumentSessions(world: GameWorld): InstrumentSessions {
  const ids = seriesIds(world.context);
  const hours: (TradingHours | null)[] = ids.map(() => null);
  for (const exchange of world.exchanges) {
    const session: TradingHours = { open: exchange.open, close: exchange.close };
    for (const i of exchange.stocks) {
      hours[i] = session;
    }
    for (const e of exchange.etfs) {
      hours[etfSeries(world.context, e)] = session;
    }
  }
  return { series: new Map(ids.map((id, series) => [id, series])), hours };
}
