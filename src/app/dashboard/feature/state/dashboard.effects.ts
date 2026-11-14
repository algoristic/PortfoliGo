import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { concatLatestFrom } from '@ngrx/operators';
import { select, Store } from '@ngrx/store';
import {
  asyncScheduler,
  catchError,
  concatMap,
  distinctUntilChanged,
  filter,
  ignoreElements,
  map,
  merge,
  Observable,
  of,
  skip,
  switchMap,
  take,
  takeUntil,
  tap,
  throttleTime,
} from 'rxjs';

import * as BankingActions from '@app/banking/feature/state/banking.actions';
import { dayIndex } from '@app/clock/domain/calendar-logic';
import { selectTick } from '@app/clock/feature/state/clock.selectors';
import { EngineService } from '@app/engine/data-access/service/engine.service';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { selectPhase } from '@app/engine/feature/state/session.selectors';
import * as MarketActions from '@app/market/feature/state/market.actions';
import { selectInstrumentsLoaded } from '@app/market/feature/state/market.selectors';
import { selectLastSeq } from '@app/notifications/feature/state/notifications.selectors';
import { LocalStorageService } from '@app/persistence/data-access/local-storage/local-storage.service';
import { ToastService } from '@app/shared/ui/toast/toast.service';
import * as TradingActions from '@app/trading/feature/state/trading.actions';

import * as DashboardActions from './dashboard.actions';
import {
  DASHBOARD_NOTIFICATION_COUNT,
  DASHBOARD_SUBSCRIPTION,
  FIRST_STEPS_SETTINGS_VERSION,
  UPCOMING_THROTTLE_MS,
} from './dashboard.model';
import {
  selectDashboardSeries,
  selectFirstStepsPlayerId,
  selectFirstStepsSettings,
} from './dashboard.selectors';
import { firstStepsOf, parseStoredFirstSteps } from './dashboard.utils';

const FIRST_STEPS_KEY = 'pgo.ui.firstSteps';

@Injectable()
export class DashboardEffects {
  readonly #actions$ = inject(Actions);
  readonly #store = inject(Store);
  readonly #engine = inject(EngineService);
  readonly #localStorage = inject(LocalStorageService);
  readonly #toastService = inject(ToastService);

  /** Ends the loads of the page: leaving it or the game, or entering another player. */
  readonly #left$ = this.#actions$.pipe(
    ofType(DashboardActions.leaveDashboardPage, SessionActions.leaveGame, SessionActions.enterGame),
  );

  /** The player's „Erste Schritte“ of this device (`pgo.ui.firstSteps`, TS §9.3). */
  loadFirstSteps$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(SessionActions.enterGame),
      switchMap(({ profile }) =>
        this.#localStorage.get<unknown>(FIRST_STEPS_KEY, FIRST_STEPS_SETTINGS_VERSION).pipe(
          map((data) =>
            DashboardActions.loadedFirstSteps({
              playerId: profile.id,
              settings: firstStepsOf(parseStoredFirstSteps(data), profile.id),
            }),
          ),
          catchError((error: unknown) => of(DashboardActions.saveFirstStepsFailure({ error }))),
        ),
      ),
    ),
  );

  /**
   * Hiding the checklist and visiting the bank comparison are saved per player at once; the
   * entries of other players stay.
   */
  saveFirstSteps$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(DashboardActions.clickedHideFirstSteps, BankingActions.enterBanksPage),
      concatLatestFrom(() => [
        this.#store.pipe(select(selectFirstStepsPlayerId)),
        this.#store.pipe(select(selectFirstStepsSettings)),
      ]),
      filter(([, playerId]) => playerId !== null),
      concatMap(([, playerId, settings]) =>
        this.#localStorage.get<unknown>(FIRST_STEPS_KEY, FIRST_STEPS_SETTINGS_VERSION).pipe(
          switchMap((data) =>
            this.#localStorage.set(FIRST_STEPS_KEY, FIRST_STEPS_SETTINGS_VERSION, {
              ...parseStoredFirstSteps(data),
              [playerId as string]: settings,
            }),
          ),
          ignoreElements(),
          catchError((error: unknown) => of(DashboardActions.saveFirstStepsFailure({ error }))),
        ),
      ),
    ),
  );

  /**
   * The worker's part of „Demnächst“ (TS §8.1): once the player is loaded, again on every new day
   * and after bookings or holdings changed, throttled to one query per `UPCOMING_THROTTLE_MS`
   * including the last trigger. Leaving the page ends it.
   */
  loadUpcoming$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(DashboardActions.enterDashboardPage),
      switchMap(() =>
        this.#loaded$().pipe(
          switchMap(() => this.#upcomingTriggers()),
          throttleTime(UPCOMING_THROTTLE_MS, asyncScheduler, { leading: true, trailing: true }),
          switchMap(() =>
            this.#engine.upcoming().pipe(
              map(({ events, days, tick }) =>
                DashboardActions.retrievedUpcoming({ upcoming: { events, days, tick } }),
              ),
              catchError((error: unknown) => of(DashboardActions.loadUpcomingFailure({ error }))),
            ),
          ),
          takeUntil(this.#left$),
        ),
      ),
    ),
  );

  /** The newest notifications: on entering and whenever new ones arrive (`lastSeq`). */
  loadRecentNotifications$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(DashboardActions.enterDashboardPage),
      switchMap(() =>
        this.#loaded$().pipe(
          switchMap(() => this.#store.pipe(select(selectLastSeq), distinctUntilChanged())),
          switchMap(() =>
            this.#engine.notifications({ offset: 0, limit: DASHBOARD_NOTIFICATION_COUNT }).pipe(
              map(({ entries }) => DashboardActions.retrievedRecentNotifications({ entries })),
              catchError((error: unknown) =>
                of(DashboardActions.loadRecentNotificationsFailure({ error })),
              ),
            ),
          ),
          takeUntil(this.#left$),
        ),
      ),
    ),
  );

  /** Quotes of every held instrument (to rank the top positions) and of the shown watchlist. */
  watchDashboardQuotes$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(DashboardActions.enterDashboardPage),
      switchMap(() =>
        this.#store.pipe(
          select(selectInstrumentsLoaded),
          filter(Boolean),
          take(1),
          switchMap(() => this.#store.pipe(select(selectDashboardSeries))),
          distinctUntilChanged((a, b) => a.join() === b.join()),
          map((series) =>
            MarketActions.quotesSubscriptionChanged({ key: DASHBOARD_SUBSCRIPTION, series }),
          ),
          takeUntil(this.#actions$.pipe(ofType(DashboardActions.leaveDashboardPage))),
        ),
      ),
    ),
  );

  leaveDashboardPage$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(DashboardActions.leaveDashboardPage),
      map(() => MarketActions.quotesSubscriptionEnded({ key: DASHBOARD_SUBSCRIPTION })),
    ),
  );

  showFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(
          DashboardActions.loadUpcomingFailure,
          DashboardActions.loadRecentNotificationsFailure,
          DashboardActions.saveFirstStepsFailure,
        ),
        tap((action) =>
          this.#toastService.error(
            action.type === DashboardActions.saveFirstStepsFailure.type
              ? $localize`:@@featureDashboard-dashboardEffects-saveFirstStepsFailure:„Erste Schritte“ ließ sich auf diesem Gerät nicht speichern.`
              : $localize`:@@featureDashboard-dashboardEffects-loadFailure:Ein Teil der Übersicht ließ sich nicht laden.`,
          ),
        ),
      ),
    { dispatch: false },
  );

  #loaded$(): Observable<unknown> {
    return this.#store.pipe(
      select(selectPhase),
      filter((phase) => phase === 'loaded'),
      take(1),
    );
  }

  /** The first query, every new game day, and projections with changed accounts or holdings. */
  #upcomingTriggers(): Observable<unknown> {
    return merge(
      of(null),
      this.#store.pipe(
        select(selectTick),
        filter((tick) => tick !== null),
        map((tick) => dayIndex(tick)),
        distinctUntilChanged(),
        skip(1),
      ),
      this.#actions$.pipe(
        ofType(BankingActions.receivedProjection),
        filter(({ projection }) => projection.accounts.length > 0),
      ),
      this.#actions$.pipe(
        ofType(TradingActions.receivedTrading),
        filter(({ trading }) => trading.depots.length > 0),
      ),
    );
  }
}
