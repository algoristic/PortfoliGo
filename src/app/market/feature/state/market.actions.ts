import { createAction, props } from '@ngrx/store';

import { IndicatorSpec } from '@app/analysis/domain/models/indicator.model';
import { PriceChartType } from '@app/charts/ui/price-chart/price-chart.model';
import {
  MoversPayload,
  ScreenerResult,
} from '@app/engine/data-access/service/engine-service.model';
import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import { Candle } from '@app/market/domain/models/candle.model';
import { ChartRange, LiveCandle } from '@app/market/domain/models/chart.model';
import { Instrument } from '@app/market/domain/models/instrument.model';
import { ScreenerSortKey, YieldRange } from '@app/market/domain/models/screener.model';
import { ScreenerFilterDimension, ScreenerRange } from '@app/market/ui/models/screener-view.model';

import { ChartSettings } from './market.model';

export const enterMarketsPage = createAction('[Market/Page] Enter markets page');
export const leaveMarketsPage = createAction('[Market/Page] Leave markets page');
export const enterScreenerPage = createAction('[Market/Page] Enter screener page');
export const leaveScreenerPage = createAction('[Market/Page] Leave screener page');
export const enterInstrumentPage = createAction('[Market/Page] Enter instrument page');
export const leaveInstrumentPage = createAction('[Market/Page] Leave instrument page');
/**
 * A view now watches the quotes of `series` under `key` (TS §8.4, §11.3); it replaces what the
 * key watched before.
 */
export const quotesSubscriptionChanged = createAction(
  '[Market/Page] Quotes subscription changed',
  props<{ key: string; series: readonly number[] }>(),
);
export const quotesSubscriptionEnded = createAction(
  '[Market/Page] Quotes subscription ended',
  props<{ key: string }>(),
);
export const moversSubscriptionStarted = createAction(
  '[Market/Page] Movers subscription started',
  props<{ key: string }>(),
);
export const moversSubscriptionEnded = createAction(
  '[Market/Page] Movers subscription ended',
  props<{ key: string }>(),
);

export const retrievedInstruments = createAction(
  '[Market/API] Retrieved instruments',
  props<{ instruments: Instrument[] }>(),
);
export const loadInstrumentsFailure = createAction(
  '[Market/API] Load instruments failure',
  props<{ error: unknown }>(),
);
/** The quotes of all subscriptions of one bundling window, the newest per series. */
export const receivedQuotes = createAction(
  '[Market/API] Received quotes',
  props<{ quotes: SeriesQuote[] }>(),
);
export const receivedMovers = createAction(
  '[Market/API] Received movers',
  props<{ movers: MoversPayload }>(),
);

export const clickedChartRange = createAction(
  '[Market/Page] Clicked chart range',
  props<{ range: ChartRange }>(),
);
export const clickedChartType = createAction(
  '[Market/Page] Clicked chart type',
  props<{ chartType: PriceChartType }>(),
);
/** A day of 1T from the day navigation; `null` returns to the live day. */
export const clickedChartDay = createAction(
  '[Market/Page] Clicked chart day',
  props<{ day: number | null }>(),
);
/** A day of 1T from the date field, already the market day on or before the date. */
export const submittedChartDate = createAction(
  '[Market/Page] Submitted chart date',
  props<{ day: number | null }>(),
);
export const scrolledToChartStart = createAction('[Market/Page] Scrolled to chart start');

export const retrievedChartCandles = createAction(
  '[Market/API] Retrieved chart candles',
  props<{ generation: number; candles: Candle[]; hasOlder: boolean }>(),
);
export const loadChartCandlesFailure = createAction(
  '[Market/API] Load chart candles failure',
  props<{ generation: number; error: unknown }>(),
);
export const retrievedOlderChartCandles = createAction(
  '[Market/API] Retrieved older chart candles',
  props<{ generation: number; candles: Candle[]; hasOlder: boolean }>(),
);
export const loadOlderChartCandlesFailure = createAction(
  '[Market/API] Load older chart candles failure',
  props<{ generation: number; error: unknown }>(),
);
/** A live candle of the chart subscription that changes or extends the loaded candles. */
export const receivedLiveCandle = createAction(
  '[Market/API] Received live candle',
  props<{ generation: number; live: LiveCandle }>(),
);
/** A live candle skipped candles (or began a new 1T day): the start block loads again. */
export const detectedChartGap = createAction(
  '[Market/API] Detected chart gap',
  props<{ generation: number }>(),
);

/** The settings of `pgo.ui.chart` (TS §9.3), read when a game is entered. */
export const loadedChartSettings = createAction(
  '[Market/API] Loaded chart settings',
  props<{ settings: ChartSettings }>(),
);
export const loadChartSettingsFailure = createAction(
  '[Market/API] Load chart settings failure',
  props<{ error: unknown }>(),
);
export const saveChartSettingsFailure = createAction(
  '[Market/API] Save chart settings failure',
  props<{ error: unknown }>(),
);
/** A new indicator (`id` `null`) or new parameters of an existing one (US-CH-02). */
export const submittedChartIndicator = createAction(
  '[Market/Page] Submitted chart indicator',
  props<{ id: string | null; spec: IndicatorSpec }>(),
);
export const clickedRemoveChartIndicator = createAction(
  '[Market/Page] Clicked remove chart indicator',
  props<{ id: string }>(),
);

/** The 15-minute candles of the trading day of an overview index (US-MK-01). */
export const retrievedOverviewSparkline = createAction(
  '[Market/API] Retrieved overview sparkline',
  props<{ series: number; candles: Candle[] }>(),
);
export const loadOverviewSparklineFailure = createAction(
  '[Market/API] Load overview sparkline failure',
  props<{ series: number; error: unknown }>(),
);
/** A live candle of an overview index that changes or extends its sparkline. */
export const receivedOverviewSparklineCandle = createAction(
  '[Market/API] Received overview sparkline candle',
  props<{ series: number; live: LiveCandle }>(),
);
/** A live candle skipped candles or began a new day: the sparkline loads again. */
export const detectedOverviewSparklineGap = createAction(
  '[Market/API] Detected overview sparkline gap',
  props<{ series: number }>(),
);

/** Every keystroke of the screener search; the query follows debounced. */
export const enteredScreenerSearch = createAction(
  '[Market/Page] Entered screener search',
  props<{ search: string }>(),
);
/** The chosen values of a list dimension of the screener filter (empty = all). */
export const selectedScreenerFilter = createAction(
  '[Market/Page] Selected screener filter',
  props<{ dimension: ScreenerFilterDimension; values: string[] }>(),
);
/** Dividend yield range as fractions; a missing bound is open. */
export const submittedScreenerDividendYield = createAction(
  '[Market/Page] Submitted screener dividend yield',
  props<{ range: YieldRange }>(),
);
export const clickedScreenerSort = createAction(
  '[Market/Page] Clicked screener sort',
  props<{ key: ScreenerSortKey }>(),
);
export const clickedResetScreenerFilter = createAction(
  '[Market/Page] Clicked reset screener filter',
);
/** The rows the list renders changed (scrolling, resizing). */
export const scrolledScreener = createAction(
  '[Market/Page] Scrolled screener',
  props<{ range: ScreenerRange }>(),
);
export const retrievedScreener = createAction(
  '[Market/API] Retrieved screener',
  props<{ generation: number; result: ScreenerResult }>(),
);
export const loadScreenerFailure = createAction(
  '[Market/API] Load screener failure',
  props<{ generation: number; error: unknown }>(),
);
