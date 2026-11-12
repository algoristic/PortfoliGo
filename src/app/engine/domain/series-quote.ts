import { dayIndex, dayStartTick, minuteOfDay } from '@app/clock/domain/calendar-logic';
import { Tick, TICKS_PER_MINUTE, TradingHours } from '@app/clock/domain/models/time.model';
import { isMarketDay } from '@app/market/domain/market-calendar';
import { MarketContext } from '@app/market/domain/market-context';
import { seriesRef } from '@app/market/domain/series';

import { PricePort } from './models/price-port.model';
import { SeriesQuote } from './models/series-quote.model';

/** Trading session of a series: its exchange for shares and ETFs, its index session otherwise. */
export function seriesSession(context: MarketContext, series: number): TradingHours {
  const { layout, indices, etfs } = context;
  const { kind, index } = seriesRef(context, series);
  const source = kind === 'stock' ? layout : kind === 'etf' ? etfs : indices;
  return {
    open: layout.boundaries[source.openBoundary[index]],
    close: layout.boundaries[source.closeBoundary[index]],
  };
}

/**
 * Tick of the previous close that the change of a quote refers to (TS §8.4): the close of the
 * market day before the latest session that has opened at `now`. During a session and after its
 * close that is the close of the market day before; before the open, the day before that.
 */
export function referenceCloseTick(hours: TradingHours, now: Tick): Tick {
  let day = dayIndex(now);
  if (!isMarketDay(day) || minuteOfDay(now) < hours.open) {
    day = previousMarketDay(day);
  }
  return dayStartTick(previousMarketDay(day)) + hours.close * TICKS_PER_MINUTE;
}

/** Quote of `series` at `now`; never reads a price after `now` (TS §4.5, rule 7). */
export function seriesQuote(
  context: MarketContext,
  prices: PricePort,
  series: number,
  now: Tick,
): SeriesQuote {
  const last = prices.priceAt(series, now, now);
  const previousClose = prices.priceAt(
    series,
    referenceCloseTick(seriesSession(context, series), now),
    now,
  );
  const { kind } = seriesRef(context, series);
  const quote = kind === 'stock' || kind === 'etf' ? prices.quoteAt(series, now, now, 0) : null;
  const change = last - previousClose;
  return {
    series,
    last,
    bid: quote?.bid ?? null,
    ask: quote?.ask ?? null,
    previousClose,
    change,
    changeRatio: change / previousClose,
  };
}

function previousMarketDay(day: number): number {
  let previous = day - 1;
  while (!isMarketDay(previous)) {
    previous--;
  }
  return previous;
}
