import { Action, createReducer, on } from '@ngrx/store';

import * as LabActions from './lab.actions';
import { LabChartOptions, LabStatus, LabTimings } from './lab.model';
import { mergeChartOptions } from './lab.utils';

import { Tick } from '../../../clock/domain/models/time.model';
import { Candle } from '../../../market/domain/models/candle.model';
import { WorldOverview } from '../../domain/models/world-overview.model';

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
  error?: unknown;
}

export const initialLabState: LabState = {
  status: 'idle',
  simulatedDays: 0,
  selectedSeries: 0,
  chartOptions: { range: '1y', resolution: '1d', chartType: 'candles' },
  candles: [],
  loadingCandles: false,
};

const MS_PER_SECOND = 1000;

const reducer = createReducer(
  initialLabState,
  on(LabActions.enterSimulationPage, LabActions.leaveSimulationPage, () => initialLabState),
  on(LabActions.submittedSeed, (state) => ({ ...state, status: 'generating', error: undefined })),
  on(LabActions.generateWorldSuccess, (state, { world }) => ({
    ...initialLabState,
    chartOptions: state.chartOptions,
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
  on(LabActions.clickedSimulate, (state) => ({
    ...state,
    status: 'simulating',
    error: undefined,
  })),
  on(LabActions.simulateSuccess, (state, { period }) => ({
    ...state,
    status: 'ready',
    now: period.now,
    simulatedDays: state.simulatedDays + period.days,
    timings: state.timings && {
      ...state.timings,
      simulationMs: period.durationMs,
      marketDaysPerSecond:
        period.durationMs > 0 ? (period.marketDays * MS_PER_SECOND) / period.durationMs : undefined,
    },
    loadingCandles: true,
  })),
  on(LabActions.simulateFailure, (state, { error }) => ({
    ...state,
    status: readyOrIdle(state),
    error,
  })),
  on(LabActions.selectedSeries, (state, { series }) => ({
    ...state,
    selectedSeries: series,
    loadingCandles: state.overview !== undefined,
  })),
  on(LabActions.changedChartOptions, (state, { options }) => ({
    ...state,
    chartOptions: mergeChartOptions(state.chartOptions, options),
    loadingCandles: state.overview !== undefined,
  })),
  on(LabActions.retrievedCandles, (state, { candles }) => ({
    ...state,
    candles: candles.candles,
    loadingCandles: false,
    timings: state.timings && { ...state.timings, candlesMs: candles.durationMs },
  })),
  on(LabActions.loadCandlesFailure, (state, { error }) => ({
    ...state,
    candles: [],
    loadingCandles: false,
    error,
  })),
);

export function labReducer(state: LabState | undefined, action: Action): LabState {
  return reducer(state, action);
}

function readyOrIdle(state: LabState): LabStatus {
  return state.overview === undefined ? 'idle' : 'ready';
}
