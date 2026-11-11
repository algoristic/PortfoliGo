import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { concatLatestFrom } from '@ngrx/operators';
import { select, Store } from '@ngrx/store';
import { catchError, exhaustMap, filter, map, of, switchMap, tap } from 'rxjs';

import * as LabActions from './lab.actions';
import { CandleRequest } from './lab.model';
import * as LabSelectors from './lab.selectors';

import { ToastService } from '../../../shared/ui/toast/toast.service';
import { LabSimulationService } from '../../data-access/service/lab-simulation.service';

@Injectable()
export class LabEffects {
  readonly #actions$ = inject(Actions);
  readonly #store = inject(Store);
  readonly #service = inject(LabSimulationService);
  readonly #toastService = inject(ToastService);

  generateWorld$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(LabActions.submittedSeed),
      switchMap(({ seed }) =>
        this.#service.generate(seed).pipe(
          map((world) => LabActions.generateWorldSuccess({ world })),
          catchError((error: unknown) => of(LabActions.generateWorldFailure({ error }))),
        ),
      ),
    ),
  );

  simulate$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(LabActions.clickedSimulate),
      exhaustMap(({ days }) =>
        this.#service.simulate(days).pipe(
          map((period) => LabActions.simulateSuccess({ period })),
          catchError((error: unknown) => of(LabActions.simulateFailure({ error }))),
        ),
      ),
    ),
  );

  loadCandles$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(
        LabActions.generateWorldSuccess,
        LabActions.simulateSuccess,
        LabActions.selectedSeries,
        LabActions.changedChartOptions,
      ),
      concatLatestFrom(() => this.#store.pipe(select(LabSelectors.selectCandleRequest))),
      map(([, request]) => request),
      filter((request): request is CandleRequest => request !== null),
      switchMap(({ series, resolution, fromTick, toTick, source }) =>
        this.#service.candles(series, resolution, fromTick, toTick, source).pipe(
          map((candles) => LabActions.retrievedCandles({ candles })),
          catchError((error: unknown) => of(LabActions.loadCandlesFailure({ error }))),
        ),
      ),
    ),
  );

  terminateWorker$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(LabActions.leaveSimulationPage),
        tap(() => this.#service.terminate()),
      ),
    { dispatch: false },
  );

  showFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(
          LabActions.generateWorldFailure,
          LabActions.simulateFailure,
          LabActions.loadCandlesFailure,
        ),
        tap(({ error }) =>
          this.#toastService.error(
            $localize`:@@featureLab-labEffects-failure:Fehler im Simulations-Labor: ${errorMessage(error)}:message:`,
          ),
        ),
      ),
    { dispatch: false },
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
