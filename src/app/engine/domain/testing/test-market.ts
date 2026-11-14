import { Tick } from '@app/clock/domain/models/time.model';
import { Quote } from '@app/shared/domain/models/quote.model';
import { bidAsk } from '@app/shared/domain/price-step-logic';

import { PricePort } from '../models/price-port.model';

/** Price of a series from `tick` on, until the next entry. */
export interface TestPrice {
  tick: Tick;
  price: number;
}

/**
 * Level of the series a test does not price at all, e.g. the world performance index the benchmark
 * buys at every close (TS §7.9) in scenarios about something else.
 */
export const UNPRICED_LEVEL = 100;

/**
 * Test market for engine scenarios (TS §14.1, principle 5): given prices per series, each valid
 * from its tick on, and a fixed relative spread. Series without any entry stand at
 * `UNPRICED_LEVEL`. Market days are ignored.
 */
export class TestMarket implements PricePort {
  readonly #prices: readonly (readonly TestPrice[])[];
  readonly #spread: number;

  /** `prices[series]` ascending by tick; the first entry must lie at or before every query. */
  constructor(prices: readonly (readonly TestPrice[])[], spread = 0.001) {
    this.#prices = prices;
    this.#spread = spread;
  }

  priceAt(series: number, tick: Tick, now: Tick): number {
    if (tick > now) {
      throw new RangeError(`TestMarket: tick ${tick} is after the current tick ${now}`);
    }
    const entries = this.#prices[series];
    if (entries === undefined) {
      return UNPRICED_LEVEL;
    }
    let price: number | undefined;
    for (const entry of entries) {
      if (entry.tick > tick) {
        break;
      }
      price = entry.price;
    }
    if (price === undefined) {
      throw new RangeError(`TestMarket: no price of series ${series} at tick ${tick}`);
    }
    return price;
  }

  quoteAt(series: number, tick: Tick, now: Tick, venueMarkup: number): Quote {
    const mid = this.priceAt(series, tick, now);
    const spread = this.#spread + venueMarkup;
    return { mid, ...bidAsk(mid, spread), spread };
  }

  rememberDay(): void {
    // Prices are given; the support points of the day steps are not needed.
  }
}
