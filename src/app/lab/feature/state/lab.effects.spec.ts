import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Action } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { firstValueFrom, of, Subject, throwError } from 'rxjs';
import type { Mocked } from 'vitest';

import * as LabActions from './lab.actions';
import { LabEffects } from './lab.effects';
import * as LabSelectors from './lab.selectors';

import { ToastService } from '../../../shared/ui/toast/toast.service';
import {
  GeneratedWorld,
  LoadedCandles,
  SimulatedPeriod,
} from '../../data-access/service/lab-simulation-service.model';
import { LabSimulationService } from '../../data-access/service/lab-simulation.service';

describe('LabEffects', () => {
  let effects: LabEffects;
  let actions$: Subject<Action>;
  let store: MockStore;
  let service: Mocked<
    Pick<LabSimulationService, 'generate' | 'simulate' | 'candles' | 'terminate'>
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
      candles: vi.fn(),
      terminate: vi.fn(),
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
    it('dispatches generateWorldSuccess with the generated world', async () => {
      service.generate.mockReturnValue(of(world));
      const result = firstValueFrom(effects.generateWorld$);
      actions$.next(LabActions.submittedSeed({ seed: 'Lab' }));
      expect(await result).toEqual(LabActions.generateWorldSuccess({ world }));
      expect(service.generate).toHaveBeenCalledWith('Lab');
    });

    it('dispatches generateWorldFailure when the worker errors', async () => {
      service.generate.mockReturnValue(throwError(() => err));
      const result = firstValueFrom(effects.generateWorld$);
      actions$.next(LabActions.submittedSeed({ seed: 'Lab' }));
      expect(await result).toEqual(LabActions.generateWorldFailure({ error: err }));
    });
  });

  describe('simulate$', () => {
    it('dispatches simulateSuccess with the simulated period', async () => {
      const period: SimulatedPeriod = { days: 7, marketDays: 5, now: 200, durationMs: 3 };
      service.simulate.mockReturnValue(of(period));
      const result = firstValueFrom(effects.simulate$);
      actions$.next(LabActions.clickedSimulate({ days: 7 }));
      expect(await result).toEqual(LabActions.simulateSuccess({ period }));
    });

    it('dispatches simulateFailure when the worker errors', async () => {
      service.simulate.mockReturnValue(throwError(() => err));
      const result = firstValueFrom(effects.simulate$);
      actions$.next(LabActions.clickedSimulate({ days: 7 }));
      expect(await result).toEqual(LabActions.simulateFailure({ error: err }));
    });
  });

  describe('loadCandles$', () => {
    const loaded: LoadedCandles = { series: 2, resolution: '1h', candles: [], durationMs: 1 };

    it('loads the candles of the current request when the series changes', async () => {
      store.overrideSelector(LabSelectors.selectCandleRequest, {
        series: 2,
        resolution: '1h',
        fromTick: 10,
        toTick: 20,
        source: 'minutes',
      });
      service.candles.mockReturnValue(of(loaded));
      const result = firstValueFrom(effects.loadCandles$);
      actions$.next(LabActions.selectedSeries({ series: 2 }));
      expect(await result).toEqual(LabActions.retrievedCandles({ candles: loaded }));
      expect(service.candles).toHaveBeenCalledWith(2, '1h', 10, 20, 'minutes');
    });

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

  describe('terminateWorker$', () => {
    it('terminates the worker when the page is left', async () => {
      const result = firstValueFrom(effects.terminateWorker$);
      actions$.next(LabActions.leaveSimulationPage());
      await result;
      expect(service.terminate).toHaveBeenCalled();
    });
  });

  describe('showFailure$', () => {
    it('shows an error toast with the message', async () => {
      const result = firstValueFrom(effects.showFailure$);
      actions$.next(LabActions.simulateFailure({ error: err }));
      await result;
      expect(toastService.error).toHaveBeenCalledWith(expect.stringContaining('worker failed'));
    });
  });
});
