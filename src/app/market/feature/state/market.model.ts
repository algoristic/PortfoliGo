import { PriceChartType } from '@app/charts/ui/price-chart/price-chart.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { MoversPayload } from '@app/engine/data-access/service/engine-service.model';
import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import { Candle, CandleResolution } from '@app/market/domain/models/candle.model';
import { ChartRange } from '@app/market/domain/models/chart.model';
import { Instrument, InstrumentKind } from '@app/market/domain/models/instrument.model';
import { ScreenerRow } from '@app/market/domain/models/screener.model';
import { PerformancePeriod } from '@app/market/domain/performance-logic';
import { ChartIndicator } from '@app/market/ui/models/chart-indicator.model';
import { ScreenerFilter, ScreenerRange } from '@app/market/ui/models/screener-view.model';

/** Quote packages of all subscriptions within this much real time make one `receivedQuotes`. */
export const QUOTES_BUNDLE_WINDOW_MS = 100;

/** Subscription keys of the pages (TS §8.4, §11.3); other views choose their own keys. */
export const MARKETS_PAGE_SUBSCRIPTION = 'markets-page';
export const INSTRUMENT_PAGE_SUBSCRIPTION = 'instrument-page';
/** The visible rows of the screener (plus `SCREENER_ROW_BUFFER` before and after). */
export const SCREENER_SUBSCRIPTION = 'screener';
/** The instruments of the watchlist tab. */
export const WATCHLIST_SUBSCRIPTION = 'watchlist';

/** The search of the screener queries this long after the last keystroke. */
export const SCREENER_SEARCH_DEBOUNCE_MS = 300;
/** The subscription of the visible rows follows scrolling at most this often (leading and trailing). */
export const SCREENER_SCROLL_THROTTLE_MS = 200;
/** Rows before and after the rendered ones whose quotes are watched as well. */
export const SCREENER_ROW_BUFFER = 10;
/** Rows assumed visible before the list reports its first range. */
export const SCREENER_INITIAL_ROWS = 20;

/** Version of `pgo.ui.chart` (TS §9.3); entries of other versions count as missing. */
export const CHART_SETTINGS_VERSION = 1;

/** At most one indicator per chart colour (TS §11.7). */
export const MAX_CHART_INDICATORS = 6;

/** What `pgo.ui.chart` keeps on this device (TS §9.3): period, chart type and indicators. */
export interface ChartSettings {
  range: ChartRange;
  chartType: PriceChartType;
  indicators: readonly ChartIndicator[];
}

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
  indicators: readonly ChartIndicator[];
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
  indicators: readonly ChartIndicator[];
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

/** An overview sparkline: the candles of one trading day; `loading` while its block loads. */
export interface OverviewSparkline {
  candles: readonly Candle[];
  loading: boolean;
}

/** Sparklines of the overview indices by series (only while the markets page is open). */
export type OverviewSparklines = Readonly<Record<number, OverviewSparkline>>;

/**
 * The screener (TS §11.3): filter, the result of the newest query and the rendered rows. Every
 * change of the filter raises `generation`; answers of older generations are dropped.
 */
export interface ScreenerState {
  filter: ScreenerFilter;
  generation: number;
  loading: boolean;
  rows: readonly ScreenerRow[];
  /** `null` before the first answer. */
  total: number | null;
  range: ScreenerRange;
  error?: unknown;
}

export interface ScreenerView {
  filter: ScreenerFilter;
  /** Search or a filter is set (the sort doesn't count). */
  filtered: boolean;
  generation: number;
  loading: boolean;
  failed: boolean;
  total: number | null;
  /** The period of the performance column. */
  performancePeriod: PerformancePeriod;
}

/**
 * The player's watchlist (US-MK-04, TS §11.3): the confirmed list of the last projection, the list
 * requested from the engine and not yet confirmed (shown instead), and the screener figures of
 * its instruments for the sparklines while the watchlist tab is open.
 */
export interface WatchlistState {
  /** `null` before the first projection with the watchlist. */
  ids: readonly string[] | null;
  /** The newest list sent with `updateWatchlist` until a projection confirms it or it fails. */
  requested: readonly string[] | null;
  rows: readonly ScreenerRow[];
}
