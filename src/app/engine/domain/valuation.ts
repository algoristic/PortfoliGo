import { Tick } from '@app/clock/domain/models/time.model';
import { seriesIds } from '@app/market/domain/series';
import { Holding, holdingsValue } from '@app/portfolio/domain/valuation-logic';
import { Cents } from '@app/shared/domain/models/money.model';

import { GameWorld } from './models/game-world.model';
import { PricePort } from './models/price-port.model';

/**
 * Values holdings at a tick (TS §7.9): shares × bid at the exchange without a bank's venue mark-up
 * (`quoteAt(…, 0)`), so the value is the same at every bank. Outside the session the bid lies
 * around the last price.
 */
export class Valuation {
  readonly #prices: PricePort;
  readonly #series: ReadonlyMap<string, number>;

  constructor(world: GameWorld, prices: PricePort) {
    this.#prices = prices;
    this.#series = new Map(seriesIds(world.context).map((id, series) => [id, series]));
  }

  /** Value of the holdings at `tick`, queried at `now` (the engine's tick, ≥ `tick`). */
  holdingsValue(holdings: readonly Holding[], tick: Tick, now: Tick = tick): Cents {
    return holdingsValue(holdings, (instrumentId) => {
      const series = this.#series.get(instrumentId);
      if (series === undefined) {
        throw new RangeError(`Valuation: unknown instrument ${instrumentId}`);
      }
      return this.#prices.quoteAt(series, tick, now, 0).bid;
    });
  }
}
