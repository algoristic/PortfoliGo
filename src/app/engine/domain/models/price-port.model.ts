import { Tick } from '@app/clock/domain/models/time.model';
import { MarketDay } from '@app/market/domain/models/market-day.model';
import { Quote } from '@app/shared/domain/models/quote.model';

/**
 * Price port of the engine (TS §14.1, principle 5). `PriceSource` implements it; engine scenarios
 * use the test market with given prices (`testing/test-market.ts`). Every query takes the current
 * tick `now` and throws for a tick after it (TS §4.5, rule 7).
 */
export interface PricePort {
  priceAt(series: number, tick: Tick, now: Tick): number;
  quoteAt(series: number, tick: Tick, now: Tick, venueMarkup: number): Quote;
  /** Receives every market day the engine steps; the day is only valid during the call. */
  rememberDay(day: Readonly<MarketDay>): void;
}
