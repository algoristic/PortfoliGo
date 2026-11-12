import { createFeatureSelector, createSelector } from '@ngrx/store';

import { CandleRequest } from './lab.model';
import { LAB_FEATURE_KEY, LabState, nextHistoryRequest } from './lab.reducer';
import { candleRequest, RANGE_RESOLUTIONS } from './lab.utils';

const selectState = createFeatureSelector<LabState>(LAB_FEATURE_KEY);

export const selectStatus = createSelector(selectState, (state) => state.status);
export const selectSeed = createSelector(selectState, (state) => state.seed);
export const selectOverview = createSelector(selectState, (state) => state.overview);
export const selectNow = createSelector(selectState, (state) => state.now);
export const selectSimulatedDays = createSelector(selectState, (state) => state.simulatedDays);
export const selectTimings = createSelector(selectState, (state) => state.timings);
export const selectSelectedSeries = createSelector(selectState, (state) => state.selectedSeries);
export const selectChartOptions = createSelector(selectState, (state) => state.chartOptions);
export const selectCandles = createSelector(selectState, (state) => state.candles);
export const selectLoadingCandles = createSelector(selectState, (state) => state.loadingCandles);
export const selectLoadingHistory = createSelector(selectState, (state) => state.loadingHistory);
export const selectStatisticsStart = createSelector(selectState, (state) => state.statisticsStart);
export const selectStatistics = createSelector(selectState, (state) => state.statistics);
export const selectLoadingStatistics = createSelector(
  selectState,
  (state) => state.loadingStatistics,
);

export const selectSelfTest = createSelector(selectState, (state) => state.selfTest);
export const selectRunningSelfTest = createSelector(selectState, (state) => state.runningSelfTest);

export const selectBusy = createSelector(
  selectStatus,
  (status) => status === 'generating' || status === 'simulating',
);

export const selectSeriesOptions = createSelector(
  selectOverview,
  (overview) => overview?.series ?? [],
);

export const selectSelectedSeriesOption = createSelector(
  selectSeriesOptions,
  selectSelectedSeries,
  (options, series) => options[series],
);

export const selectAllowedResolutions = createSelector(
  selectChartOptions,
  (options) => RANGE_RESOLUTIONS[options.range],
);

/** Candles to load for the chart, or `null` without a world. */
export const selectCandleRequest = createSelector(
  selectSelectedSeries,
  selectChartOptions,
  selectNow,
  (series, options, now): CandleRequest | null =>
    now === undefined ? null : candleRequest(series, options, now),
);

/** Block of older candles being loaded, or `null` when no history block loads. */
export const selectHistoryRequest = createSelector(selectState, (state): CandleRequest | null =>
  state.loadingHistory ? nextHistoryRequest(state) : null,
);
