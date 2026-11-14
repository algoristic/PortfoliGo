import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { concatLatestFrom } from '@ngrx/operators';
import { Action, select, Store } from '@ngrx/store';
import {
  asyncScheduler,
  catchError,
  concat,
  debounceTime,
  defer,
  distinctUntilChanged,
  filter,
  finalize,
  last,
  map,
  merge,
  mergeMap,
  Observable,
  of,
  skip,
  switchMap,
  take,
  takeUntil,
  tap,
  throttleTime,
} from 'rxjs';

import { AccountId, OpenableAccountKind } from '@app/banking/domain/models/account.model';
import { statementPeriodRange } from '@app/banking/domain/statement-period-logic';
import { tickToDateTime } from '@app/clock/domain/calendar-logic';
import { Tick } from '@app/clock/domain/models/time.model';
import { selectTick } from '@app/clock/feature/state/clock.selectors';
import {
  ProjectionPayload,
  StatementRequest,
} from '@app/engine/data-access/service/engine-service.model';
import { EngineService } from '@app/engine/data-access/service/engine.service';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { selectPhase } from '@app/engine/feature/state/session.selectors';
import { isEngineCommandError } from '@app/engine/feature/state/session.utils';
import { ToastService } from '@app/shared/ui/toast/toast.service';
import { formatCents } from '@app/shared/util/format';

import { bankCommandFailureMessage } from './banking-errors.utils';
import * as BankingActions from './banking.actions';
import { StatementState, StatementWindowRequest } from './banking.model';
import { selectNetWorth, selectStatement, selectStatementAccountId } from './banking.selectors';
import { statementWindowRequest } from './banking.utils';

/** Typing pauses this long before the search reaches the worker. */
export const STATEMENT_SEARCH_DEBOUNCE_MS = 300;
/** At most one load of the monthly overview in this time, the last trigger included. */
export const MONTHLY_VALUES_THROTTLE_MS = 500;

interface StatementLoad {
  generation: number;
  request: StatementRequest;
}

@Injectable()
export class BankingEffects {
  readonly #actions$ = inject(Actions);
  readonly #engine = inject(EngineService);
  readonly #toastService = inject(ToastService);
  readonly #store = inject(Store);

  /** Ends the loads of the statement page: leaving it or the game, or entering another player. */
  readonly #statementLeft$ = this.#actions$.pipe(
    ofType(
      BankingActions.leaveAccountStatementPage,
      SessionActions.leaveGame,
      SessionActions.enterGame,
    ),
  );

  /** Ends what a loaded player started: leaving the game or entering another one. */
  readonly #ended$ = this.#actions$.pipe(
    ofType(SessionActions.leaveGame, SessionActions.enterGame),
  );

  /** Ends the monthly overview: leaving the accounts page or the game, or entering another player. */
  readonly #accountsLeft$ = this.#actions$.pipe(
    ofType(
      BankingActions.leaveAccountsPage,
      BankingActions.leaveMonthlyValues,
      SessionActions.leaveGame,
      SessionActions.enterGame,
    ),
  );

  /**
   * The engine sends the full projection of a player right before its reply to `loadPlayer`
   * (TS §8.4); projections before it may still belong to the previous player. So the slice takes
   * the last full projection before the reply and every projection after it, including the full
   * one after a worker restart.
   */
  watchProjection$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(SessionActions.enterGame),
      switchMap(({ profile }) => {
        const loaded$ = this.#actions$.pipe(
          ofType(SessionActions.loadPlayerSuccess),
          filter(({ loaded }) => loaded.playerId === profile.id),
          take(1),
        );
        const fullBeforeLoad$ = this.#engine.projection$.pipe(
          filter((projection) => projection.full),
          takeUntil(loaded$),
          last(undefined, null),
          filter((projection): projection is ProjectionPayload => projection !== null),
        );
        return concat(fullBeforeLoad$, this.#engine.projection$).pipe(
          map((projection) => BankingActions.receivedProjection({ projection })),
          takeUntil(this.#ended$),
        );
      }),
    ),
  );

  /** Banks of the world with their conditions; queries pass while catching up. */
  loadBanks$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(SessionActions.loadPlayerSuccess),
      switchMap(() =>
        this.#engine.banks().pipe(
          map(({ banks }) => BankingActions.retrievedBanks({ banks })),
          catchError((error: unknown) => of(BankingActions.loadBanksFailure({ error }))),
          takeUntil(this.#ended$),
        ),
      ),
    ),
  );

  openAccount$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(BankingActions.submittedOpenAccount),
      mergeMap(({ bankId, kind }) =>
        this.#engine.openAccount(bankId, kind).pipe(
          map(({ accountId, depotId, tick }) =>
            BankingActions.openAccountSuccess({ bankId, kind, accountId, depotId, tick }),
          ),
          catchError((error: unknown) => of(BankingActions.openAccountFailure({ error }))),
        ),
      ),
    ),
  );

  closeAccount$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(BankingActions.submittedCloseAccount),
      mergeMap(({ accountId, targetAccountId }) =>
        this.#engine.closeAccount(accountId, targetAccountId).pipe(
          map(({ tick }) =>
            BankingActions.closeAccountSuccess(
              targetAccountId === undefined
                ? { accountId, tick }
                : { accountId, targetAccountId, tick },
            ),
          ),
          catchError((error: unknown) => of(BankingActions.closeAccountFailure({ error }))),
        ),
      ),
    ),
  );

  setSalaryAccount$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(BankingActions.submittedSalaryAccount),
      mergeMap(({ accountId }) =>
        this.#engine.setSalaryAccount(accountId).pipe(
          map(({ tick }) => BankingActions.setSalaryAccountSuccess({ accountId, tick })),
          catchError((error: unknown) => of(BankingActions.setSalaryAccountFailure({ error }))),
        ),
      ),
    ),
  );

  transfer$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(BankingActions.submittedTransfer),
      mergeMap(({ transfer }) =>
        this.#engine.transfer(transfer).pipe(
          map(({ tick }) => BankingActions.transferSuccess({ transfer, tick })),
          catchError((error: unknown) => of(BankingActions.transferFailure({ error }))),
        ),
      ),
    ),
  );

  createStandingOrder$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(BankingActions.submittedCreateStandingOrder),
      mergeMap(({ order }) =>
        this.#engine.createStandingOrder(order).pipe(
          map(({ standingOrderId, tick }) =>
            BankingActions.createStandingOrderSuccess({ standingOrderId, tick }),
          ),
          catchError((error: unknown) => of(BankingActions.createStandingOrderFailure({ error }))),
        ),
      ),
    ),
  );

  changeStandingOrder$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(BankingActions.submittedChangeStandingOrder),
      mergeMap(({ standingOrderId, order }) =>
        this.#engine.changeStandingOrder(standingOrderId, order).pipe(
          map(({ tick }) => BankingActions.changeStandingOrderSuccess({ standingOrderId, tick })),
          catchError((error: unknown) => of(BankingActions.changeStandingOrderFailure({ error }))),
        ),
      ),
    ),
  );

  setStandingOrderPaused$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(BankingActions.submittedStandingOrderPaused),
      mergeMap(({ standingOrderId, paused }) =>
        this.#engine.setStandingOrderPaused(standingOrderId, paused).pipe(
          map(({ tick }) =>
            BankingActions.setStandingOrderPausedSuccess({ standingOrderId, paused, tick }),
          ),
          catchError((error: unknown) =>
            of(BankingActions.setStandingOrderPausedFailure({ error })),
          ),
        ),
      ),
    ),
  );

  deleteStandingOrder$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(BankingActions.submittedDeleteStandingOrder),
      mergeMap(({ standingOrderId }) =>
        this.#engine.deleteStandingOrder(standingOrderId).pipe(
          map(({ tick }) => BankingActions.deleteStandingOrderSuccess({ standingOrderId, tick })),
          catchError((error: unknown) => of(BankingActions.deleteStandingOrderFailure({ error }))),
        ),
      ),
    ),
  );

  showStandingOrderSuccess$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(
          BankingActions.createStandingOrderSuccess,
          BankingActions.changeStandingOrderSuccess,
          BankingActions.setStandingOrderPausedSuccess,
          BankingActions.deleteStandingOrderSuccess,
        ),
        tap((action) => {
          switch (action.type) {
            case BankingActions.createStandingOrderSuccess.type:
              this.#toastService.success(
                $localize`:@@featureBanking-bankingEffects-createStandingOrderSuccess:Der Dauerauftrag ist angelegt.`,
              );
              break;
            case BankingActions.changeStandingOrderSuccess.type:
              this.#toastService.success(
                $localize`:@@featureBanking-bankingEffects-changeStandingOrderSuccess:Der Dauerauftrag ist geändert.`,
              );
              break;
            case BankingActions.setStandingOrderPausedSuccess.type:
              this.#toastService.success(
                action.paused
                  ? $localize`:@@featureBanking-bankingEffects-pauseStandingOrderSuccess:Der Dauerauftrag ist pausiert.`
                  : $localize`:@@featureBanking-bankingEffects-resumeStandingOrderSuccess:Der Dauerauftrag läuft wieder.`,
              );
              break;
            case BankingActions.deleteStandingOrderSuccess.type:
              this.#toastService.success(
                $localize`:@@featureBanking-bankingEffects-deleteStandingOrderSuccess:Der Dauerauftrag ist gelöscht.`,
              );
              break;
          }
        }),
      ),
    { dispatch: false },
  );

  showStandingOrderFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(
          BankingActions.createStandingOrderFailure,
          BankingActions.changeStandingOrderFailure,
          BankingActions.setStandingOrderPausedFailure,
          BankingActions.deleteStandingOrderFailure,
        ),
        tap((action) => {
          switch (action.type) {
            case BankingActions.createStandingOrderFailure.type:
              this.#toastService.error(
                bankCommandFailureMessage('createStandingOrder', action.error),
              );
              break;
            case BankingActions.changeStandingOrderFailure.type:
              this.#toastService.error(
                bankCommandFailureMessage('changeStandingOrder', action.error),
              );
              break;
            case BankingActions.setStandingOrderPausedFailure.type:
              this.#toastService.error(
                bankCommandFailureMessage('setStandingOrderPaused', action.error),
              );
              break;
            case BankingActions.deleteStandingOrderFailure.type:
              this.#toastService.error(
                bankCommandFailureMessage('deleteStandingOrder', action.error),
              );
              break;
          }
        }),
      ),
    { dispatch: false },
  );

  /**
   * The statement page (TS §11.3, AP 3.4): once the player is loaded the first rows, then a new
   * query when the filter changes (the search debounced), the window around the rendered rows when
   * they reach rows that are not loaded, and the current window again when a projection reports a
   * change of the account (new bookings). A new query replaces the running load. Scrolling does not:
   * the worker answers one query after the other (each reads all bookings of the account), so while
   * a load runs, scrolling waits and its arrival checks the rendered rows again. Leaving the page
   * ends the loads.
   */
  loadStatement$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(BankingActions.enterAccountStatementPage),
      switchMap(() =>
        this.#store.pipe(
          select(selectPhase),
          filter((phase) => phase === 'loaded'),
          take(1),
          switchMap(() => this.#statementLoads()),
          takeUntil(this.#statementLeft$),
        ),
      ),
    ),
  );

  /**
   * The monthly overview of the accounts page (US-EK-03, TS §11.3): once the player is loaded, then
   * again when a month ends or a projection changes the net worth (bookings), throttled to one load
   * per `MONTHLY_VALUES_THROTTLE_MS` including the last trigger. Leaving the page ends it. The
   * dashboard starts the same load for its cash flow (`enterMonthlyValues`, AP 5.7).
   */
  loadMonthlyValues$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(BankingActions.enterAccountsPage, BankingActions.enterMonthlyValues),
      switchMap(() =>
        this.#store.pipe(
          select(selectPhase),
          filter((phase) => phase === 'loaded'),
          take(1),
          switchMap(() => this.#monthlyValuesTriggers()),
          throttleTime(MONTHLY_VALUES_THROTTLE_MS, asyncScheduler, {
            leading: true,
            trailing: true,
          }),
          switchMap(() =>
            this.#engine.monthlyValues().pipe(
              map(({ closedMonths, current }) =>
                BankingActions.retrievedMonthlyValues({ monthlyValues: { closedMonths, current } }),
              ),
              catchError((error: unknown) =>
                of(BankingActions.loadMonthlyValuesFailure({ error })),
              ),
            ),
          ),
          takeUntil(this.#accountsLeft$),
        ),
      ),
    ),
  );

  showMonthlyValuesFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(BankingActions.loadMonthlyValuesFailure),
        tap(() =>
          this.#toastService.error(
            $localize`:@@featureBanking-bankingEffects-loadMonthlyValuesFailure:Die Monatsübersicht konnte nicht geladen werden.`,
          ),
        ),
      ),
    { dispatch: false },
  );

  /** An unknown account shows on the page itself; other failures as a toast. */
  showStatementFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(BankingActions.loadStatementFailure),
        filter(
          ({ error }) =>
            !isEngineCommandError(error, 'unknown-account') &&
            !isEngineCommandError(error, 'invalid-command'),
        ),
        tap(() =>
          this.#toastService.error(
            $localize`:@@featureBanking-bankingEffects-loadStatementFailure:Der Kontoauszug konnte nicht geladen werden.`,
          ),
        ),
      ),
    { dispatch: false },
  );

  showSuccess$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(
          BankingActions.openAccountSuccess,
          BankingActions.closeAccountSuccess,
          BankingActions.setSalaryAccountSuccess,
          BankingActions.transferSuccess,
        ),
        tap((action) => {
          switch (action.type) {
            case BankingActions.openAccountSuccess.type:
              this.#toastService.success(openedMessage(action.kind));
              break;
            case BankingActions.closeAccountSuccess.type:
              this.#toastService.success(
                $localize`:@@featureBanking-bankingEffects-closeAccountSuccess:Das Konto ist geschlossen.`,
              );
              break;
            case BankingActions.setSalaryAccountSuccess.type:
              this.#toastService.success(
                $localize`:@@featureBanking-bankingEffects-setSalaryAccountSuccess:Dein Gehalt geht ab jetzt auf das neue Gehaltskonto.`,
              );
              break;
            case BankingActions.transferSuccess.type:
              this.#toastService.success(
                $localize`:@@featureBanking-bankingEffects-transferSuccess:${formatCents(action.transfer.amount)}:amount: überwiesen.`,
              );
              break;
          }
        }),
      ),
    { dispatch: false },
  );

  showFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(
          BankingActions.openAccountFailure,
          BankingActions.closeAccountFailure,
          BankingActions.setSalaryAccountFailure,
          BankingActions.transferFailure,
        ),
        tap((action) => {
          switch (action.type) {
            case BankingActions.openAccountFailure.type:
              this.#toastService.error(bankCommandFailureMessage('openAccount', action.error));
              break;
            case BankingActions.closeAccountFailure.type:
              this.#toastService.error(bankCommandFailureMessage('closeAccount', action.error));
              break;
            case BankingActions.setSalaryAccountFailure.type:
              this.#toastService.error(bankCommandFailureMessage('setSalaryAccount', action.error));
              break;
            case BankingActions.transferFailure.type:
              this.#toastService.error(bankCommandFailureMessage('transfer', action.error));
              break;
          }
        }),
      ),
    { dispatch: false },
  );

  /** The loads of the statement page, each with the window and filter of its moment. */
  #statementLoads(): Observable<Action> {
    return defer(() => {
      // The load that runs, if any; only it may clear the mark.
      let running: object | null = null;
      return this.#statementTriggers().pipe(
        filter((force) => force || running === null),
        concatLatestFrom(() => [
          this.#store.pipe(select(selectStatementAccountId)),
          this.#store.pipe(select(selectStatement)),
          this.#store.pipe(select(selectTick)),
        ]),
        map(([force, accountId, statement, tick]) => {
          const window = statementWindowRequest(statement, statement.range, force);
          return accountId === null || window === null
            ? null
            : {
                generation: statement.generation,
                request: statementRequest(accountId, statement, window, tick),
              };
        }),
        filter((load): load is StatementLoad => load !== null),
        switchMap(({ generation, request }) => {
          const load = {};
          running = load;
          const done = (): void => {
            if (running === load) {
              running = null;
            }
          };
          return this.#engine.statement(request).pipe(
            tap({ next: done, error: done }),
            map(({ total, entries }) =>
              BankingActions.retrievedStatementPage({
                generation,
                offset: request.offset,
                total,
                entries,
              }),
            ),
            catchError((error: unknown) =>
              of(BankingActions.loadStatementFailure({ generation, error })),
            ),
            finalize(done),
          );
        }),
      );
    });
  }

  /** The first load, then every change of the net worth and every new month of the game time. */
  #monthlyValuesTriggers(): Observable<unknown> {
    return merge(
      of(null),
      this.#store.pipe(select(selectNetWorth), distinctUntilChanged(), skip(1)),
      this.#store.pipe(
        select(selectTick),
        filter((tick): tick is Tick => tick !== null),
        map((tick) => {
          const { year, month } = tickToDateTime(tick);
          return year * 12 + month;
        }),
        distinctUntilChanged(),
        skip(1),
      ),
    );
  }

  /** `true`: a new query or new bookings; `false`: the rendered rows may need another window. */
  #statementTriggers(): Observable<boolean> {
    const actions$ = this.#actions$;
    return merge(
      of(true),
      actions$.pipe(
        ofType(
          BankingActions.selectedStatementPeriod,
          BankingActions.selectedStatementTypes,
          BankingActions.clickedResetStatementFilter,
        ),
        map(() => true),
      ),
      actions$.pipe(
        ofType(BankingActions.enteredStatementSearch),
        debounceTime(STATEMENT_SEARCH_DEBOUNCE_MS),
        map(() => true),
      ),
      actions$.pipe(
        ofType(BankingActions.scrolledStatement, BankingActions.retrievedStatementPage),
        map(() => false),
      ),
      actions$.pipe(
        ofType(BankingActions.receivedProjection),
        concatLatestFrom(() => this.#store.pipe(select(selectStatementAccountId))),
        filter(([{ projection }, accountId]) =>
          projection.accounts.some((account) => account.id === accountId),
        ),
        map(() => true),
      ),
    );
  }
}

/** The query of a window: the period as ticks of the game time, empty filters left out. */
function statementRequest(
  accountId: AccountId,
  { filter }: StatementState,
  { offset, limit }: StatementWindowRequest,
  tick: Tick | null,
): StatementRequest {
  const request: StatementRequest = {
    accountId,
    offset,
    limit,
    ...(tick === null ? {} : statementPeriodRange(filter.period, tick)),
  };
  if (filter.types.length > 0) {
    request.types = [...filter.types];
  }
  const search = filter.search.trim();
  if (search !== '') {
    request.search = search;
  }
  return request;
}

function openedMessage(kind: OpenableAccountKind): string {
  switch (kind) {
    case 'current':
      return $localize`:@@featureBanking-bankingEffects-openCurrentSuccess:Das Girokonto ist eröffnet.`;
    case 'savings':
      return $localize`:@@featureBanking-bankingEffects-openSavingsSuccess:Das Tagesgeldkonto ist eröffnet.`;
    case 'depot':
      return $localize`:@@featureBanking-bankingEffects-openDepotSuccess:Das Depot mit Verrechnungskonto ist eröffnet.`;
  }
}
