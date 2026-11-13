import { PriceChartType } from '@app/charts/ui/price-chart/price-chart.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { MoversPayload } from '@app/engine/data-access/service/engine-service.model';
import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import { Candle, CandleResolution } from '@app/market/domain/models/candle.model';
import { ChartRange } from '@app/market/domain/models/chart.model';
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

/**
 * The chart of the instrument page (TS §11.3, §11.7): period, chart type, the chosen past day of 1T
 * (`null` = live), the loaded candles of the shown chart only, and the loading state. Every new
 * start block raises `generation`; answers of older generations are dropped.
 */
export interface InstrumentChartState {
  range: ChartRange;
  chartType: PriceChartType;
  day: number | null;
  generation: number;
  candles: readonly Candle[];
  hasOlder: boolean;
  /** The start block loads after a change of the user (shown as a placeholder). */
  loading: boolean;
  /** The start block loads again after skipped live candles (the chart stays visible). */
  reloading: boolean;
  loadingOlder: boolean;
  error?: unknown;
}

/** What the chart subscription follows: live candles only while the block reaches now. */
export interface ChartSubscription {
  interval: CandleResolution;
  live: boolean;
}

/** The chart of the instrument page as the view shows it. */
export interface InstrumentChartView {
  range: ChartRange;
  interval: CandleResolution;
  chartType: PriceChartType;
  candles: readonly Candle[];
  /** The newest candle, `null` without candles. */
  lastCandle: Candle | null;
  loading: boolean;
  loadingOlder: boolean;
  failed: boolean;
  /** Day navigation of 1T (day indices): live or a chosen day, the days before and after. */
  live: boolean;
  /** Start of the shown day. */
  shownDayTick: Tick;
  shownDay: number;
  /** The market day before the shown one, `null` at the first market day. */
  previousDay: number | null;
  /** The day after the shown one, `null` for live; `undefined` while already live. */
  nextDay: number | null | undefined;
  /** Today (day index), the latest date the day field offers. */
  today: number;
}
