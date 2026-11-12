import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Action } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { firstValueFrom, of, Subject, throwError } from 'rxjs';
import type { Mocked } from 'vitest';

import { ToastService } from '@app/shared/ui/toast/toast.service';

import * as LabActions from './lab.actions';
import { LabEffects } from './lab.effects';
import { CandleRequest } from './lab.model';
import * as LabSelectors from './lab.selectors';

import {
  ComputedStatistics,
  GeneratedWorld,
  SimulatedPeriod,
} from '../../data-access/service/lab-simulation-service.model';
import { LabSimulationService } from '../../data-access/service/lab-simulation.service';
import { LabStatistics } from '../../domain/models/lab-statistics.model';

describe('LabEffects', () => {
  let effects: LabEffects;
  let actions$: Subject<Action>;
  let store: MockStore;
  let service: Mocked<
    Pick<
      LabSimulationService,
      'generate' | 'simulate' | 'simulateYears' | 'statistics' | 'candles' | 'goldenChecksums'
    >
  >;
  let toastService: Mocked<Pick<ToastService, 'error'>>;
  const err = new Error('worker failed');
  const world: GeneratedWorld = {
    seed: 'lab',
    overview: { companies: [], indices: [], etfs: [], banks: [], series: [] },
    now: 100,
    worldMs: 1,
    prehistoryMs: 2,
  };

  beforeEach(() => {
    actions$ = new Subject();
    service = {
      generate: vi.fn(),
      simulate: vi.fn(),
      simulateYears: vi.fn(),
      statistics: vi.fn(),
      candles: vi.fn(),
      goldenChecksums: vi.fn(),
    };
    toastService = { error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        LabEffects,
        provideMockActions(() => actions$.asObservable()),
        provideMockStore(),
        { provide: LabSimulationService, useValue: service },
        { provide: ToastService, useValue: toastService },
      ],
    });
    effects = TestBed.inject(LabEffects);
    store = TestBed.inject(MockStore);
  });

  afterEach(() => {
    store.resetSelectors();
  });

  describe('generateWorld$', () => {
    it('dispatches generateWorldFailure when the worker errors', async () => {
      service.generate.mockReturnValue(throwError(() => err));
      const result = firstValueFrom(effects.generateWorld$);
      actions$.next(LabActions.submittedSeed({ seed: 'Lab' }));
      expect(await result).toEqual(LabActions.generateWorldFailure({ error: err }));
    });
  });

  describe('simulate$', () => {
    it('simulates years instead of days for clickedSimulateYears', async () => {
      const period: SimulatedPeriod = { days: 3653, marketDays: 2609, now: 200, durationMs: 3 };
      service.simulateYears.mockReturnValue(of(period));
      const result = firstValueFrom(effects.simulate$);
      actions$.next(LabActions.clickedSimulateYears({ years: 10 }));
      expect(await result).toEqual(LabActions.simulateSuccess({ period }));
      expect(service.simulateYears).toHaveBeenCalledWith(10);
    });

    it('dispatches simulateFailure when the worker errors', async () => {
      service.simulate.mockReturnValue(throwError(() => err));
      const result = firstValueFrom(effects.simulate$);
      actions$.next(LabActions.clickedSimulate({ days: 7 }));
      expect(await result).toEqual(LabActions.simulateFailure({ error: err }));
    });
  });

  describe('computeStatistics$', () => {
    const result: ComputedStatistics = {
      statistics: { start: 'game-start' } as LabStatistics,
      durationMs: 5,
    };

    it('computes the statistics for the selected start', async () => {
      store.overrideSelector(LabSelectors.selectStatisticsStart, 'game-start');
      store.overrideSelector(LabSelectors.selectOverview, world.overview);
      service.statistics.mockReturnValue(of(result));
      const emitted = firstValueFrom(effects.computeStatistics$);
      actions$.next(LabActions.clickedComputeStatistics());
      expect(await emitted).toEqual(LabActions.computeStatisticsSuccess({ result }));
      expect(service.statistics).toHaveBeenCalledWith('game-start');
    });

    it('does nothing without a world', () => {
      store.overrideSelector(LabSelectors.selectStatisticsStart, 'epoch');
      store.overrideSelector(LabSelectors.selectOverview, undefined);
      effects.computeStatistics$.subscribe();
      actions$.next(LabActions.changedStatisticsStart({ start: 'epoch' }));
      expect(service.statistics).not.toHaveBeenCalled();
    });

    it('dispatches computeStatisticsFailure when the worker errors', async () => {
      store.overrideSelector(LabSelectors.selectStatisticsStart, 'epoch');
      store.overrideSelector(LabSelectors.selectOverview, world.overview);
      service.statistics.mockReturnValue(throwError(() => err));
      const emitted = firstValueFrom(effects.computeStatistics$);
      actions$.next(LabActions.clickedComputeStatistics());
      expect(await emitted).toEqual(LabActions.computeStatisticsFailure({ error: err }));
    });
  });

  describe('loadCandles$', () => {
    it('dispatches loadCandlesFailure when the worker errors', async () => {
      store.overrideSelector(LabSelectors.selectCandleRequest, {
        series: 2,
        resolution: '1h',
        fromTick: 10,
        toTick: 20,
        source: 'minutes',
      });
      service.candles.mockReturnValue(throwError(() => err));
      const result = firstValueFrom(effects.loadCandles$);
      actions$.next(LabActions.generateWorldSuccess({ world }));
      expect(await result).toEqual(LabActions.loadCandlesFailure({ error: err }));
    });

    it('loads nothing without a world', () => {
      store.overrideSelector(LabSelectors.selectCandleRequest, null);
      const emitted: Action[] = [];
      const subscription = effects.loadCandles$.subscribe((action) => emitted.push(action));
      actions$.next(LabActions.changedChartOptions({ options: { range: '1d' } }));
      subscription.unsubscribe();
      expect(emitted).toEqual([]);
      expect(service.candles).not.toHaveBeenCalled();
    });
  });

  describe('loadHistory$', () => {
    const request: CandleRequest = {
      series: 2,
      resolution: '1d',
      fromTick: 0,
      toTick: 9,
      source: 'minutes',
    };
    it('dispatches loadHistoryFailure when the worker errors', async () => {
      store.overrideSelector(LabSelectors.selectHistoryRequest, request);
      service.candles.mockReturnValue(throwError(() => err));
      const result = firstValueFrom(effects.loadHistory$);
      actions$.next(LabActions.scrolledToChartStart());
      expect(await result).toEqual(LabActions.loadHistoryFailure({ error: err }));
    });

    it('loads nothing when no history block is due', () => {
      store.overrideSelector(LabSelectors.selectHistoryRequest, null);
      const subscription = effects.loadHistory$.subscribe();
      actions$.next(LabActions.scrolledToChartStart());
      subscription.unsubscribe();
      expect(service.candles).not.toHaveBeenCalled();
    });
  });

  describe('runSelfTest$', () => {
    it('dispatches runSelfTestFailure when the worker errors', async () => {
      service.goldenChecksums.mockReturnValue(throwError(() => err));
      const result = firstValueFrom(effects.runSelfTest$);
      actions$.next(LabActions.clickedRunSelfTest());
      expect(await result).toEqual(LabActions.runSelfTestFailure({ error: err }));
    });
  });

  describe('showFailure$', () => {
    it.each([
      LabActions.simulateFailure({ error: err }),
      LabActions.runSelfTestFailure({ error: err }),
    ])('shows an error toast with the message for $type', async (failure) => {
      const result = firstValueFrom(effects.showFailure$);
      actions$.next(failure);
      await result;
      expect(toastService.error).toHaveBeenCalledWith(expect.stringContaining('worker failed'));
    });
  });
});
