import * as LabActions from './lab.actions';
import { initialLabState, labReducer, LabState } from './lab.reducer';

import { GeneratedWorld } from '../../data-access/service/lab-simulation-service.model';

const world: GeneratedWorld = {
  seed: 'lab',
  overview: { companies: [], indices: [], etfs: [], banks: [], series: [] },
  now: 100,
  worldMs: 20,
  prehistoryMs: 400,
};

function ready(): LabState {
  return labReducer(initialLabState, LabActions.generateWorldSuccess({ world }));
}

describe('labReducer', () => {
  it('resets the state when entering and leaving the page', () => {
    expect(labReducer(ready(), LabActions.enterSimulationPage())).toEqual(initialLabState);
    expect(labReducer(ready(), LabActions.leaveSimulationPage())).toEqual(initialLabState);
  });

  it('marks the world as generating when a seed is submitted', () => {
    const state = labReducer(
      { ...initialLabState, error: 'old' },
      LabActions.submittedSeed({ seed: 'x' }),
    );
    expect(state.status).toBe('generating');
    expect(state.error).toBeUndefined();
  });

  it('takes over the generated world, keeps the chart options and starts loading candles', () => {
    const before: LabState = {
      ...initialLabState,
      chartOptions: { range: '3m', resolution: '1h', chartType: 'line' },
      simulatedDays: 30,
      selectedSeries: 7,
    };
    expect(labReducer(before, LabActions.generateWorldSuccess({ world }))).toEqual({
      ...initialLabState,
      chartOptions: before.chartOptions,
      status: 'ready',
      seed: 'lab',
      overview: world.overview,
      now: 100,
      timings: { worldMs: 20, prehistoryMs: 400 },
      loadingCandles: true,
    });
  });

  it('returns to idle or ready on failures', () => {
    const error = new Error('x');
    expect(
      labReducer(
        { ...initialLabState, status: 'generating' },
        LabActions.generateWorldFailure({ error }),
      ),
    ).toMatchObject({ status: 'idle', error });
    expect(
      labReducer({ ...ready(), status: 'simulating' }, LabActions.simulateFailure({ error })),
    ).toMatchObject({ status: 'ready', error });
  });

  it('advances the clock and computes the throughput after a simulation', () => {
    const simulating = labReducer(ready(), LabActions.clickedSimulate({ days: 7 }));
    expect(simulating.status).toBe('simulating');
    const state = labReducer(
      simulating,
      LabActions.simulateSuccess({ period: { days: 7, marketDays: 5, now: 200, durationMs: 50 } }),
    );
    expect(state).toMatchObject({
      status: 'ready',
      now: 200,
      simulatedDays: 7,
      loadingCandles: true,
      timings: { worldMs: 20, prehistoryMs: 400, simulationMs: 50, marketDaysPerSecond: 100 },
    });
  });

  it('keeps the resolution valid when the chart options change', () => {
    const state = labReducer(ready(), LabActions.changedChartOptions({ options: { range: '1d' } }));
    expect(state.chartOptions).toEqual({ range: '1d', resolution: '5m', chartType: 'candles' });
    expect(state.loadingCandles).toBe(true);
  });

  it('loads candles only with a world when the series changes', () => {
    expect(labReducer(initialLabState, LabActions.selectedSeries({ series: 3 }))).toMatchObject({
      selectedSeries: 3,
      loadingCandles: false,
    });
    expect(labReducer(ready(), LabActions.selectedSeries({ series: 3 }))).toMatchObject({
      selectedSeries: 3,
      loadingCandles: true,
    });
  });

  it('stores retrieved candles and their query time', () => {
    const candles = [{ tick: 1, open: 1, high: 2, low: 0.5, close: 1.5 }];
    const state = labReducer(
      ready(),
      LabActions.retrievedCandles({
        candles: { series: 0, resolution: '1d', candles, durationMs: 4 },
      }),
    );
    expect(state.candles).toEqual(candles);
    expect(state.loadingCandles).toBe(false);
    expect(state.timings?.candlesMs).toBe(4);
  });

  it('clears the candles when loading fails', () => {
    const error = new Error('x');
    const state = labReducer(
      { ...ready(), candles: [{ tick: 1, open: 1, high: 1, low: 1, close: 1 }] },
      LabActions.loadCandlesFailure({ error }),
    );
    expect(state).toMatchObject({ candles: [], loadingCandles: false, error });
  });
});
