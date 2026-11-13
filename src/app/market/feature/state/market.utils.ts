import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';

import { QuoteSubscriptions } from './market.model';

/** The series of a subscription, sorted and without duplicates. */
export function normalizeSeries(series: readonly number[]): number[] {
  return [...new Set(series)].sort((a, b) => a - b);
}

export function sameSeries(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((series, index) => series === b[index]);
}

/** Every series that at least one subscription watches. */
export function subscribedSeries(subscriptions: QuoteSubscriptions): Set<number> {
  return new Set(Object.values(subscriptions).flat());
}

/** The newest quote per series of several packages, in the order of first arrival. */
export function latestQuotes(packages: readonly (readonly SeriesQuote[])[]): SeriesQuote[] {
  const latest = new Map<number, SeriesQuote>();
  for (const quotes of packages) {
    for (const quote of quotes) {
      latest.set(quote.series, quote);
    }
  }
  return [...latest.values()];
}
