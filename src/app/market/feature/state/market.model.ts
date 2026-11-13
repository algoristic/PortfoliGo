import { MoversPayload } from '@app/engine/data-access/service/engine-service.model';
import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import { Instrument, InstrumentKind } from '@app/market/domain/models/instrument.model';

/** Quote packages of all subscriptions within this much real time make one `receivedQuotes`. */
export const QUOTES_BUNDLE_WINDOW_MS = 100;

/** Subscription keys of the pages (TS §8.4, §11.3); other views choose their own keys. */
export const MARKETS_PAGE_SUBSCRIPTION = 'markets-page';
export const INSTRUMENT_PAGE_SUBSCRIPTION = 'instrument-page';

/** Named quote subscriptions: the series each view watches, sorted and without duplicates. */
export type QuoteSubscriptions = Readonly<Record<string, readonly number[]>>;

/** Gainers, losers and sectors of the day with the tick they belong to. */
export type MarketMoversView = MoversPayload;

export type InstrumentsByKind = Readonly<Record<InstrumentKind, readonly Instrument[]>>;

/** A quote with its instrument, `null` until the first quote of the series arrived. */
export interface InstrumentQuote {
  instrument: Instrument;
  quote: SeriesQuote | null;
}
