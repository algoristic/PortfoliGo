import { Action, createReducer, on } from '@ngrx/store';

import { Tick } from '@app/clock/domain/models/time.model';

import { Candle } from '@app/market/domain/models/candle.model';

import * as LabActions from './lab.actions';
import { CandleRequest, LabStatus, LabTimings } from './lab.model';

import {
  historyRequest,
  isSameCandleRequest,
  mergeChartOptions,
  prependCandles,
} from './lab.utils';

import { LabStatistics, StatisticsStart } from '../../domain/models/lab-statistics.model';
import { WorldOverview } from '../../domain/models/world-overview.model';
import { LabChartOptions } from '../../ui/series-chart/series-chart.model';

export const LAB_FEATURE_KEY = 'lab';

export interface LabState {
  status: LabStatus;
  seed?: string;
  overview?: WorldOverview;
  now?: Tick;
  /** Calendar days simulated after the game start. */
  simulatedDays: number;
  timings?: LabTimings;
  selectedSeries: number;
  chartOptions: LabChartOptions;
  candles: Candle[];
  loadingCandles: boolean;
  /** Start of the period the loaded candles cover; older blocks load when the chart scrolls. */
  historyFrom?: Tick;
  loadingHistory: boolean;
  statisticsStart: StatisticsStart;
  /** Statistics of the current period; dropped when the period changes. */
  statistics?: LabStatistics;
  loadingStatistics: boolean;
  error?: unknown;
}

export const initialLabState: LabState = {
  status: 'idle',
  simulatedDays: 0,
  selectedSeries: 0,
  chartOptions: { range: '1y', resolution: '1d', chartType: 'candles' },
  candles: [],
  loadingCandles: false,
  loadingHistory: false,
  statisticsStart: 'epoch',
  loadingStatistics: false,
};

const MS_PER_SECOND = 1000;

const reducer = createReducer(
  initialLabState,
  on(LabActions.enterSimulationPage, LabActions.leaveSimulationPage, () => initialLabState),
  on(LabActions.submittedSeed, (state) => ({ ...state, status: 'generating', error: undefined })),
  on(LabActions.generateWorldSuccess, (state, { world }) => ({
    ...initialLabState,
    chartOptions: state.chartOptions,
    statisticsStart: state.statisticsStart,
    status: 'ready',
    seed: world.seed,
    overview: world.overview,
    now: world.now,
    timings: { worldMs: world.worldMs, prehistoryMs: world.prehistoryMs },
    loadingCandles: true,
  })),
  on(LabActions.generateWorldFailure, (state, { error }) => ({
    ...state,
    status: readyOrIdle(state),
    error,
  })),
  on(LabActions.clickedSimulate, LabActions.clickedSimulateYears, (state) => ({
    ...state,
    status: 'simulating',
    error: undefined,
  })),
  on(LabActions.simulateSuccess, (state, { period }) => ({
    ...state,
    status: 'ready',
    now: period.now,
    simulatedDays: state.simulatedDays + period.days,
    statistics: undefined,
    timings: state.timings && {
      ...state.timings,
      simulationMs: period.durationMs,
      marketDaysPerSecond:
        period.durationMs > 0 ? (period.marketDays * MS_PER_SECOND) / period.durationMs : undefined,
    },
    ...reloadCandles(),
  })),
  on(LabActions.simulateFailure, (state, { error }) => ({
    ...state,
    status: readyOrIdle(state),
    error,
  })),
  on(LabActions.clickedComputeStatistics, (state) => ({
    ...state,
    loadingStatistics: state.overview !== undefined,
  })),
  on(LabActions.changedStatisticsStart, (state, { start }) => ({
    ...state,
    statisticsStart: start,
    statistics: undefined,
    loadingStatistics: state.overview !== undefined,
  })),
  on(LabActions.computeStatisticsSuccess, (state, { result }) => ({
    ...state,
    statistics: result.statistics,
    loadingStatistics: false,
    timings: state.timings && { ...state.timings, statisticsMs: result.durationMs },
  })),
  on(LabActions.computeStatisticsFailure, (state, { error }) => ({
    ...state,
    statistics: undefined,
    loadingStatistics: false,
    error,
  })),
  on(LabActions.selectedSeries, (state, { series }) => ({
    ...state,
    selectedSeries: series,
    ...reloadCandles(state.overview !== undefined),
  })),
  on(LabActions.changedChartOptions, (state, { options }) => {
    const chartOptions = mergeChartOptions(state.chartOptions, options);
    return chartOptions === state.chartOptions
      ? state
      : { ...state, chartOptions, ...reloadCandles(state.overview !== undefined) };
  }),
  on(LabActions.retrievedCandles, (state, { request, candles }) => ({
    ...state,
    candles: candles.candles,
    loadingCandles: false,
    historyFrom: request.fromTick,
    timings: state.timings && { ...state.timings, candlesMs: candles.durationMs },
  })),
  on(LabActions.loadCandlesFailure, (state, { error }) => ({
    ...state,
    candles: [],
    loadingCandles: false,
    historyFrom: undefined,
    error,
  })),
  on(LabActions.scrolledToChartStart, (state) =>
    state.loadingHistory || nextHistoryRequest(state) === null
      ? state
      : { ...state, loadingHistory: true },
  ),
  // A block for another series, range or period (changed while it loaded) is dropped.
  on(LabActions.retrievedHistoryCandles, (state, { request, candles }) =>
    state.loadingHistory && isSameCandleRequest(request, nextHistoryRequest(state))
      ? {
          ...state,
          candles: prependCandles(candles.candles, state.candles),
          historyFrom: request.fromTick,
          loadingHistory: false,
          timings: state.timings && { ...state.timings, candlesMs: candles.durationMs },
        }
      : state,
  ),
  on(LabActions.loadHistoryFailure, (state, { error }) => ({
    ...state,
    loadingHistory: false,
    error,
  })),
);

export function labReducer(state: LabState | undefined, action: Action): LabState {
  return reducer(state, action);
}

function readyOrIdle(state: LabState): LabStatus {
  return state.overview === undefined ? 'idle' : 'ready';
}

/** Next block of older candles, or `null` while the candles load or the history is complete. */
export function nextHistoryRequest(state: LabState): CandleRequest | null {
  return state.loadingCandles || state.historyFrom === undefined || state.candles.length === 0
    ? null
    : historyRequest(state.selectedSeries, state.chartOptions, state.historyFrom);
}

function reloadCandles(
  loadingCandles = true,
): Pick<LabState, 'loadingCandles' | 'historyFrom' | 'loadingHistory'> {
  return { loadingCandles, historyFrom: undefined, loadingHistory: false };
}
