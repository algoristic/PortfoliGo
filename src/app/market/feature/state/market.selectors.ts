import { getRouterSelectors } from '@ngrx/router-store';
import { createFeatureSelector, createSelector } from '@ngrx/store';

import { dayIndex, dayStartTick, GAME_START_TICK } from '@app/clock/domain/calendar-logic';
import { selectTick } from '@app/clock/feature/state/clock.selectors';
import {
  CHART_RANGE_INTERVALS,
  nextChartDay,
  previousChartDay,
  shownChartDay,
} from '@app/market/domain/chart-view-logic';
import { Instrument, INSTRUMENT_KINDS } from '@app/market/domain/models/instrument.model';

import {
  ChartSubscription,
  InstrumentChartView,
  InstrumentQuote,
  InstrumentsByKind,
} from './market.model';
import {
  instrumentsAdapter,
  MARKET_FEATURE_KEY,
  MarketState,
  quotesAdapter,
} from './market.reducer';

const selectState = createFeatureSelector<MarketState>(MARKET_FEATURE_KEY);
const instrumentSelectors = instrumentsAdapter.getSelectors();
const quoteSelectors = quotesAdapter.getSelectors();
const { selectRouteParam } = getRouterSelectors();

const selectInstrumentsState = createSelector(selectState, (state) => state.instruments);
const selectQuotesState = createSelector(selectState, (state) => state.quotes);

/** All series in series order: shares, price indices, total return indices, ETFs. */
export const selectInstruments = createSelector(
  selectInstrumentsState,
  instrumentSelectors.selectAll,
);
export const selectInstrumentEntities = createSelector(
  selectInstrumentsState,
  instrumentSelectors.selectEntities,
);
export const selectInstrumentsLoaded = createSelector(
  selectState,
  (state) => state.instrumentsLoaded,
);
export const selectQuoteEntities = createSelector(selectQuotesState, quoteSelectors.selectEntities);
export const selectQuoteSubscriptions = createSelector(
  selectState,
  (state) => state.quoteSubscriptions,
);
export const selectMoversWanted = createSelector(
  selectState,
  (state) => state.moversSubscriptions.length > 0,
);
export const selectMovers = createSelector(selectState, (state) => state.movers);

/** Instruments by series index, for views that get series from quotes or movers. */
export const selectInstrumentsBySeries = createSelector(
  selectInstruments,
  (instruments): ReadonlyMap<number, Instrument> =>
    new Map(instruments.map((instrument) => [instrument.series, instrument])),
);

export const selectInstrumentsByKind = createSelector(
  selectInstruments,
  (instruments): InstrumentsByKind =>
    Object.fromEntries(
      INSTRUMENT_KINDS.map((kind) => [
        kind,
        instruments.filter((instrument) => instrument.kind === kind),
      ]),
    ) as unknown as InstrumentsByKind,
);

/**
 * The indices of the markets page (US-MK-01): the price indices except the sector indices, whose
 * quotes come with the movers.
 */
export const selectOverviewIndexSeries = createSelector(selectInstruments, (instruments) =>
  instruments
    .filter(
      (instrument) =>
        instrument.kind === 'index' &&
        instrument.variant === 'price' &&
        instrument.indexKind !== 'sector',
    )
    .map((instrument) => instrument.series),
);

export const selectInstrumentById = (id: string) =>
  createSelector(selectInstrumentEntities, (entities) => entities[id] ?? null);

/** Quote of an instrument; `null` while the instrument is unknown. */
export const selectInstrumentQuote = (id: string) =>
  createSelector(
    selectInstrumentById(id),
    selectQuoteEntities,
    (instrument, quotes): InstrumentQuote | null =>
      instrument === null ? null : { instrument, quote: quotes[instrument.series] ?? null },
  );

export const selectRouteInstrumentId = selectRouteParam('instrumentId');

/** The instrument of `/game/:playerId/markets/:instrumentId`; `null` while unknown. */
export const selectRouteInstrument = createSelector(
  selectRouteInstrumentId,
  selectInstrumentEntities,
  (id, entities) => (id === undefined ? null : (entities[id] ?? null)),
);

export const selectRouteInstrumentQuote = createSelector(
  selectRouteInstrument,
  selectQuoteEntities,
  (instrument, quotes): InstrumentQuote | null =>
    instrument === null ? null : { instrument, quote: quotes[instrument.series] ?? null },
);

export const selectChart = createSelector(selectState, (state) => state.chart);

/** The chart subscription of the instrument page: live candles only while the block reaches now. */
export const selectChartSubscription = createSelector(selectChart, (chart): ChartSubscription => ({
  interval: CHART_RANGE_INTERVALS[chart.range],
  live: chart.day === null,
}));

/** Today's day index; changes once a day, so the chart view doesn't follow every clock tick. */
const selectToday = createSelector(selectTick, (tick) => dayIndex(tick ?? GAME_START_TICK));

export const selectChartView = createSelector(
  selectChart,
  selectToday,
  (chart, today): InstrumentChartView => {
    const now = dayStartTick(today);
    const shownDay = shownChartDay(chart.day, chart.candles, now);
    return {
      range: chart.range,
      interval: CHART_RANGE_INTERVALS[chart.range],
      chartType: chart.chartType,
      candles: chart.candles,
      lastCandle: chart.candles.at(-1) ?? null,
      loading: chart.loading,
      loadingOlder: chart.loadingOlder,
      failed: chart.error !== undefined && chart.candles.length === 0,
      live: chart.day === null,
      shownDay,
      shownDayTick: dayStartTick(shownDay),
      previousDay: previousChartDay(shownDay),
      nextDay: chart.day === null ? undefined : nextChartDay(chart.day, now),
      today,
    };
  },
);
