import { TICKS_PER_DAY } from '@app/clock/domain/models/time.model';

import * as LabActions from './lab.actions';
import { CandleRequest } from './lab.model';
import { initialLabState, labReducer, LabState, nextHistoryRequest } from './lab.reducer';

import {
  ComputedChecksums,
  ComputedStatistics,
  GeneratedWorld,
} from '../../data-access/service/lab-simulation-service.model';
import { LabStatistics } from '../../domain/models/lab-statistics.model';

const world: GeneratedWorld = {
  seed: 'lab',
  overview: { companies: [], indices: [], etfs: [], banks: [], series: [] },
  now: 100,
  worldMs: 20,
  prehistoryMs: 400,
};

const request: CandleRequest = {
  series: 0,
  resolution: '1d',
  fromTick: 0,
  toTick: 100,
  source: 'minutes',
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

  it('simulates years like days', () => {
    expect(labReducer(ready(), LabActions.clickedSimulateYears({ years: 10 })).status).toBe(
      'simulating',
    );
  });

  describe('statistics', () => {
    const result: ComputedStatistics = {
      statistics: { start: 'epoch', marketDays: 10 } as LabStatistics,
      durationMs: 30,
    };

    it('starts loading only with a world', () => {
      expect(
        labReducer(initialLabState, LabActions.clickedComputeStatistics()).loadingStatistics,
      ).toBe(false);
      expect(labReducer(ready(), LabActions.clickedComputeStatistics()).loadingStatistics).toBe(
        true,
      );
    });

    it('stores the statistics and their duration', () => {
      const loading = labReducer(ready(), LabActions.clickedComputeStatistics());
      expect(labReducer(loading, LabActions.computeStatisticsSuccess({ result }))).toMatchObject({
        statistics: result.statistics,
        loadingStatistics: false,
        timings: { statisticsMs: 30 },
      });
    });

    it('drops the statistics when the start or the period changes and keeps the start', () => {
      const shown = labReducer(ready(), LabActions.computeStatisticsSuccess({ result }));
      const changed = labReducer(shown, LabActions.changedStatisticsStart({ start: 'game-start' }));
      expect(changed).toMatchObject({ statisticsStart: 'game-start', loadingStatistics: true });
      expect(changed.statistics).toBeUndefined();
      const simulated = labReducer(
        shown,
        LabActions.simulateSuccess({ period: { days: 1, marketDays: 1, now: 200, durationMs: 1 } }),
      );
      expect(simulated.statistics).toBeUndefined();
      expect(labReducer(changed, LabActions.generateWorldSuccess({ world })).statisticsStart).toBe(
        'game-start',
      );
    });

    it('stops loading on failure', () => {
      const error = new Error('failed');
      const loading = labReducer(ready(), LabActions.clickedComputeStatistics());
      expect(labReducer(loading, LabActions.computeStatisticsFailure({ error }))).toMatchObject({
        loadingStatistics: false,
        error,
      });
    });
  });

  it('keeps the resolution valid when the chart options change', () => {
    const state = labReducer(ready(), LabActions.changedChartOptions({ options: { range: '1d' } }));
    expect(state.chartOptions).toEqual({ range: '1d', resolution: '5m', chartType: 'candles' });
    expect(state.loadingCandles).toBe(true);
  });

  it('keeps the state when the chart options do not change', () => {
    const state = ready();
    expect(labReducer(state, LabActions.changedChartOptions({ options: { range: '1y' } }))).toBe(
      state,
    );
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

  it('stores retrieved candles, the start of their period and their query time', () => {
    const candles = [{ tick: 1, open: 1, high: 2, low: 0.5, close: 1.5 }];
    const state = labReducer(
      ready(),
      LabActions.retrievedCandles({
        request: { ...request, fromTick: 0 },
        candles: { series: 0, resolution: '1d', candles, durationMs: 4 },
      }),
    );
    expect(state.candles).toEqual(candles);
    expect(state.loadingCandles).toBe(false);
    expect(state.historyFrom).toBe(0);
    expect(state.timings?.candlesMs).toBe(4);
  });

  describe('history', () => {
    const candle = (tick: number) => ({ tick, open: 1, high: 1, low: 1, close: 1 });
    const from = 100 * TICKS_PER_DAY;

    function loaded(): LabState {
      return labReducer(
        ready(),
        LabActions.retrievedCandles({
          request: { ...request, fromTick: from },
          candles: { series: 0, resolution: '1d', candles: [candle(from + 600)], durationMs: 1 },
        }),
      );
    }

    function loadingHistory(): LabState {
      return labReducer(loaded(), LabActions.scrolledToChartStart());
    }

    it('starts loading a block only when one is due', () => {
      expect(loadingHistory().loadingHistory).toBe(true);
      const complete = { ...loaded(), historyFrom: 0 };
      expect(labReducer(complete, LabActions.scrolledToChartStart())).toBe(complete);
    });

    it('puts the older candles in front and moves the start of the period', () => {
      const state = loadingHistory();
      const block = nextHistoryRequest(state);
      expect(block).not.toBeNull();
      if (block === null) {
        return;
      }
      const next = labReducer(
        state,
        LabActions.retrievedHistoryCandles({
          request: block,
          candles: {
            series: 0,
            resolution: '1d',
            candles: [candle(from - 800), candle(from + 600)],
            durationMs: 1,
          },
        }),
      );
      expect(next.candles).toEqual([candle(from - 800), candle(from + 600)]);
      expect(next.historyFrom).toBe(block.fromTick);
      expect(next.loadingHistory).toBe(false);
    });

    it('drops a block that no longer fits the chart', () => {
      const state = labReducer(
        loadingHistory(),
        LabActions.changedChartOptions({ options: { range: '3m' } }),
      );
      expect(state).toMatchObject({ historyFrom: undefined, loadingHistory: false });
      const block = { ...request, fromTick: 0, toTick: from - 1 };
      const next = labReducer(
        state,
        LabActions.retrievedHistoryCandles({
          request: block,
          candles: { series: 0, resolution: '1d', candles: [candle(1)], durationMs: 1 },
        }),
      );
      expect(next).toBe(state);
    });

    it('stops loading when the block fails', () => {
      const error = new Error('x');
      expect(labReducer(loadingHistory(), LabActions.loadHistoryFailure({ error }))).toMatchObject({
        loadingHistory: false,
        error,
      });
    });
  });

  it('clears the candles when loading fails', () => {
    const error = new Error('x');
    const state = labReducer(
      { ...ready(), candles: [{ tick: 1, open: 1, high: 1, low: 1, close: 1 }] },
      LabActions.loadCandlesFailure({ error }),
    );
    expect(state).toMatchObject({ candles: [], loadingCandles: false, error });
  });

  describe('self-test', () => {
    const result: ComputedChecksums = {
      checksums: {
        world: 'a',
        prices: 'b',
        minutes: 'c',
        indices: 'd',
        etfs: 'e',
        gameStart: 'f',
      },
      durationMs: 1500,
    };

    it('drops the last result while a new self-test runs and stores the new one', () => {
      const running = labReducer(
        { ...initialLabState, selfTest: result },
        LabActions.clickedRunSelfTest(),
      );
      expect(running).toMatchObject({ selfTest: undefined, runningSelfTest: true });
      expect(labReducer(running, LabActions.runSelfTestSuccess({ result }))).toMatchObject({
        selfTest: result,
        runningSelfTest: false,
      });
    });

    it('keeps the result and the running self-test when a world is generated', () => {
      const before = { ...initialLabState, selfTest: result, runningSelfTest: true };
      expect(labReducer(before, LabActions.generateWorldSuccess({ world }))).toMatchObject({
        selfTest: result,
        runningSelfTest: true,
      });
    });

    it('stops running on failure', () => {
      const error = new Error('x');
      expect(
        labReducer(
          { ...initialLabState, runningSelfTest: true },
          LabActions.runSelfTestFailure({ error }),
        ),
      ).toMatchObject({ runningSelfTest: false, error });
    });
  });
});
