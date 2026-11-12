import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { concatLatestFrom } from '@ngrx/operators';
import { select, Store } from '@ngrx/store';
import {
  catchError,
  concatMap,
  concatWith,
  exhaustMap,
  filter,
  from,
  map,
  Observable,
  of,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs';

import { ToastService } from '@app/shared/ui/toast/toast.service';

import * as LabActions from './lab.actions';
import { CandleRequest } from './lab.model';
import * as LabSelectors from './lab.selectors';

import { LAB_SEED_COMPARISON } from '../../data-access/service/lab-simulation-service.config';
import { LoadedCandles } from '../../data-access/service/lab-simulation-service.model';
import { LabSimulationService } from '../../data-access/service/lab-simulation.service';

@Injectable()
export class LabEffects {
  readonly #actions$ = inject(Actions);
  readonly #store = inject(Store);
  readonly #service = inject(LabSimulationService);
  readonly #toastService = inject(ToastService);
  readonly #seedComparison = inject(LAB_SEED_COMPARISON);

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
      ofType(LabActions.clickedSimulate, LabActions.clickedSimulateYears),
      exhaustMap((action) =>
        (action.type === LabActions.clickedSimulate.type
          ? this.#service.simulate(action.days)
          : this.#service.simulateYears(action.years)
        ).pipe(
          map((period) => LabActions.simulateSuccess({ period })),
          catchError((error: unknown) => of(LabActions.simulateFailure({ error }))),
        ),
      ),
    ),
  );

  computeStatistics$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(LabActions.clickedComputeStatistics, LabActions.changedStatisticsStart),
      concatLatestFrom(() => [
        this.#store.pipe(select(LabSelectors.selectStatisticsStart)),
        this.#store.pipe(select(LabSelectors.selectOverview)),
      ]),
      filter(([, , overview]) => overview !== undefined),
      switchMap(([, start]) =>
        this.#service.statistics(start).pipe(
          map((result) => LabActions.computeStatisticsSuccess({ result })),
          catchError((error: unknown) => of(LabActions.computeStatisticsFailure({ error }))),
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
      switchMap((request) =>
        this.#loadCandles(request).pipe(
          map((candles) => LabActions.retrievedCandles({ request, candles })),
          catchError((error: unknown) => of(LabActions.loadCandlesFailure({ error }))),
        ),
      ),
    ),
  );

  loadHistory$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(LabActions.scrolledToChartStart),
      concatLatestFrom(() => this.#store.pipe(select(LabSelectors.selectHistoryRequest))),
      map(([, request]) => request),
      filter((request): request is CandleRequest => request !== null),
      exhaustMap((request) =>
        this.#loadCandles(request).pipe(
          map((candles) => LabActions.retrievedHistoryCandles({ request, candles })),
          catchError((error: unknown) => of(LabActions.loadHistoryFailure({ error }))),
        ),
      ),
    ),
  );

  runSelfTest$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(LabActions.clickedRunSelfTest),
      exhaustMap(() =>
        this.#service.goldenChecksums().pipe(
          map((result) => LabActions.runSelfTestSuccess({ result })),
          catchError((error: unknown) => of(LabActions.runSelfTestFailure({ error }))),
        ),
      ),
    ),
  );

  /**
   * One seed after the other (the worker is single-threaded); the first failure ends the run, and
   * so does leaving the page (the worker is stopped then).
   */
  compareSeeds$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(LabActions.clickedCompareSeeds),
      exhaustMap(() => {
        const { seeds, years } = this.#seedComparison;
        return from(seeds).pipe(
          concatMap((seed) => this.#service.seedRun(seed, years)),
          map((result) => LabActions.seedRunSuccess({ result })),
          concatWith(of(LabActions.compareSeedsSuccess())),
          catchError((error: unknown) => of(LabActions.compareSeedsFailure({ error }))),
          takeUntil(this.#actions$.pipe(ofType(LabActions.leaveSimulationPage))),
        );
      }),
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
          LabActions.loadHistoryFailure,
          LabActions.computeStatisticsFailure,
          LabActions.runSelfTestFailure,
          LabActions.compareSeedsFailure,
        ),
        tap(({ error }) =>
          this.#toastService.error(
            $localize`:@@featureLab-labEffects-failure:Fehler im Simulations-Labor: ${errorMessage(error)}:message:`,
          ),
        ),
      ),
    { dispatch: false },
  );

  #loadCandles({
    series,
    resolution,
    fromTick,
    toTick,
    source,
  }: CandleRequest): Observable<LoadedCandles> {
    return this.#service.candles(series, resolution, fromTick, toTick, source);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
