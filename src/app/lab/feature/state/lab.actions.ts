import { createAction, props } from '@ngrx/store';

import { CandleRequest, LabChartOptions } from './lab.model';

import {
  ComputedStatistics,
  GeneratedWorld,
  LoadedCandles,
  SimulatedPeriod,
} from '../../data-access/service/lab-simulation-service.model';
import { StatisticsStart } from '../../domain/models/lab-statistics.model';

export const enterSimulationPage = createAction('[Lab/Page] Enter simulation page');
export const leaveSimulationPage = createAction('[Lab/Page] Leave simulation page');
export const submittedSeed = createAction('[Lab/Page] Submitted seed', props<{ seed: string }>());
export const clickedSimulate = createAction(
  '[Lab/Page] Clicked simulate',
  props<{ days: number }>(),
);
export const clickedSimulateYears = createAction(
  '[Lab/Page] Clicked simulate years',
  props<{ years: number }>(),
);
export const clickedComputeStatistics = createAction('[Lab/Page] Clicked compute statistics');
export const changedStatisticsStart = createAction(
  '[Lab/Page] Changed statistics start',
  props<{ start: StatisticsStart }>(),
);
export const selectedSeries = createAction(
  '[Lab/Page] Selected series',
  props<{ series: number }>(),
);
export const changedChartOptions = createAction(
  '[Lab/Page] Changed chart options',
  props<{ options: Partial<LabChartOptions> }>(),
);
export const scrolledToChartStart = createAction('[Lab/Page] Scrolled to chart start');

export const generateWorldSuccess = createAction(
  '[Lab/API] Generate world success',
  props<{ world: GeneratedWorld }>(),
);
export const generateWorldFailure = createAction(
  '[Lab/API] Generate world failure',
  props<{ error: unknown }>(),
);
export const simulateSuccess = createAction(
  '[Lab/API] Simulate success',
  props<{ period: SimulatedPeriod }>(),
);
export const simulateFailure = createAction(
  '[Lab/API] Simulate failure',
  props<{ error: unknown }>(),
);
export const computeStatisticsSuccess = createAction(
  '[Lab/API] Compute statistics success',
  props<{ result: ComputedStatistics }>(),
);
export const computeStatisticsFailure = createAction(
  '[Lab/API] Compute statistics failure',
  props<{ error: unknown }>(),
);
export const retrievedCandles = createAction(
  '[Lab/API] Retrieved candles',
  props<{ request: CandleRequest; candles: LoadedCandles }>(),
);
export const loadCandlesFailure = createAction(
  '[Lab/API] Load candles failure',
  props<{ error: unknown }>(),
);
export const retrievedHistoryCandles = createAction(
  '[Lab/API] Retrieved history candles',
  props<{ request: CandleRequest; candles: LoadedCandles }>(),
);
export const loadHistoryFailure = createAction(
  '[Lab/API] Load history failure',
  props<{ error: unknown }>(),
);
