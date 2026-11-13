import { inject, Injectable, PendingTasks } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { concatLatestFrom } from '@ngrx/operators';
import { select, Store } from '@ngrx/store';
import {
  buffer,
  catchError,
  concatMap,
  connect,
  defer,
  distinctUntilChanged,
  exhaustMap,
  filter,
  finalize,
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
  timer,
} from 'rxjs';

import { NotificationsRequest } from '@app/engine/data-access/service/engine-service.model';
import { EngineService } from '@app/engine/data-access/service/engine.service';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { selectPhase, selectStatus } from '@app/engine/feature/state/session.selectors';
import { AbsenceReport } from '@app/notifications/domain/models/absence-report.model';
import {
  MarkReadRequest,
  NOTIFICATION_CODE_INFO,
} from '@app/notifications/domain/models/notification.model';
import {
  notificationCodeLabel,
  notificationCountLabel,
} from '@app/notifications/ui/labels/notification-labels';
import {
  AccountNames,
  notificationText,
} from '@app/notifications/ui/labels/notification-text.utils';
import { ToastService } from '@app/shared/ui/toast/toast.service';

import { notificationFailureMessage } from './notifications-errors.utils';
import * as NotificationsActions from './notifications.actions';
import { NOTIFICATION_PAGE_SIZE, NotificationBundle } from './notifications.model';
import { selectAccountNames, selectCenter, selectLastSeq } from './notifications.selectors';
import { bundleToastNotifications, toastTone } from './notifications.utils';

/** Notifications of one code within this much real time make one toast (US-BN-02, TS §12). */
export const TOAST_BUNDLE_WINDOW_MS = 1_000;

@Injectable()
export class NotificationsEffects {
  readonly #actions$ = inject(Actions);
  readonly #engine = inject(EngineService);
  readonly #store = inject(Store);
  readonly #toastService = inject(ToastService);
  readonly #pendingTasks = inject(PendingTasks);

  /** Ends what a loaded player started: leaving the game or entering another one. */
  readonly #ended$ = this.#actions$.pipe(
    ofType(SessionActions.leaveGame, SessionActions.enterGame),
  );

  /** Ends the loads of the centre: leaving it or the game, or entering another player. */
  readonly #centerLeft$ = this.#actions$.pipe(
    ofType(
      NotificationsActions.leaveNotificationsPage,
      SessionActions.leaveGame,
      SessionActions.enterGame,
    ),
  );

  /**
   * New notifications of the entered player (TS §8.3) from its reply to `loadPlayer` on; the
   * engine sends none while catching up, and before the reply they may belong to the previous one.
   */
  watchNotifications$ = createEffect(() =>
    this.#afterLoad(() =>
      this.#engine.notification$.pipe(
        map(({ tick, notifications }) =>
          NotificationsActions.receivedNotifications({ tick, notifications }),
        ),
      ),
    ),
  );

  /**
   * Toasts of the codes with a toast by default (TS §12; the switches per code follow in AP 6.2).
   * The first notification opens a window of `TOAST_BUNDLE_WINDOW_MS`; at its end, the
   * notifications of each code make one toast. The window is a pending task, so that tests and
   * `whenStable` wait for the toasts.
   */
  showToasts$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(NotificationsActions.receivedNotifications),
        map(({ notifications }) =>
          notifications.filter(({ code }) => NOTIFICATION_CODE_INFO[code].toast),
        ),
        filter((notifications) => notifications.length > 0),
        connect((notifications$) =>
          notifications$.pipe(buffer(notifications$.pipe(exhaustMap(() => this.#window())))),
        ),
        map((windows) => bundleToastNotifications(windows.flat())),
        concatLatestFrom(() => this.#store.pipe(select(selectAccountNames))),
        tap(([bundles, accountNames]) => {
          for (const bundle of bundles) {
            this.#toastService.show(toastTone(bundle.severity), toastMessage(bundle, accountNames));
          }
        }),
      ),
    { dispatch: false },
  );

  /**
   * The open page of the centre (US-BN-01, TS §11.3): once the player is loaded, again when the
   * filter or the page changes and when new notifications arrive (`lastSeq` of the projection) or
   * marking them read failed. A new query replaces the running one; leaving the page ends it.
   */
  loadCenter$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(NotificationsActions.enterNotificationsPage),
      switchMap(() =>
        this.#store.pipe(
          select(selectPhase),
          filter((phase) => phase === 'loaded'),
          take(1),
          switchMap(() => this.#centerTriggers()),
          concatLatestFrom(() => this.#store.pipe(select(selectCenter))),
          switchMap(([, center]) => {
            const { generation, category, offset } = center;
            const request: NotificationsRequest = {
              offset,
              limit: NOTIFICATION_PAGE_SIZE,
              ...(category === null ? {} : { category }),
            };
            return this.#engine.notifications(request).pipe(
              map(({ total, entries }) =>
                NotificationsActions.retrievedNotificationsPage({ generation, total, entries }),
              ),
              catchError((error: unknown) =>
                of(NotificationsActions.loadNotificationsFailure({ generation, error })),
              ),
            );
          }),
          takeUntil(this.#centerLeft$),
        ),
      ),
    ),
  );

  /** One notification, or all up to the newest the projection reported („Alle gelesen“). */
  markRead$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(
        NotificationsActions.clickedMarkNotificationRead,
        NotificationsActions.clickedMarkAllNotificationsRead,
      ),
      concatLatestFrom(() => this.#store.pipe(select(selectLastSeq))),
      map(([action, lastSeq]): MarkReadRequest | null => {
        if (action.type === NotificationsActions.clickedMarkNotificationRead.type) {
          return { seqs: [action.seq] };
        }
        return lastSeq === null || lastSeq === 0 ? null : { upTo: lastSeq };
      }),
      filter((request): request is MarkReadRequest => request !== null),
      mergeMap((request) =>
        this.#engine
          .markNotificationsRead({
            ...(request.upTo === undefined ? {} : { upTo: request.upTo }),
            ...(request.seqs === undefined ? {} : { seqs: [...request.seqs] }),
          })
          .pipe(
            map(() => NotificationsActions.markNotificationsReadSuccess()),
            catchError((error: unknown) =>
              of(NotificationsActions.markNotificationsReadFailure({ error })),
            ),
          ),
      ),
    ),
  );

  setAutoPause$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(NotificationsActions.toggledAutoPause),
      concatMap(({ code, enabled }) =>
        this.#engine.setAutoPause(code, enabled).pipe(
          map(() => NotificationsActions.setAutoPauseSuccess({ code, enabled })),
          catchError((error: unknown) =>
            of(NotificationsActions.setAutoPauseFailure({ code, error })),
          ),
        ),
      ),
    ),
  );

  /** The `report` event after a catch-up or a hidden period (US-BN-03). */
  watchReports$ = createEffect(() =>
    this.#afterLoad(() =>
      this.#engine.report$.pipe(
        map((report) => NotificationsActions.receivedAbsenceReport({ report })),
      ),
    ),
  );

  /**
   * The reply to `loadPlayer` comes before the catch-up, so its report may arrive before the
   * slice listens or while the worker restarts: once the game is ready, the slice asks for the
   * last report (TS §12). The reducer takes a period only once.
   */
  loadMissedReport$ = createEffect(() =>
    this.#afterLoad(() =>
      this.#store.pipe(
        select(selectStatus),
        filter((status) => status === 'ready'),
        take(1),
        switchMap(() =>
          this.#engine.absenceReport().pipe(
            map(({ report }) => report),
            filter((report): report is AbsenceReport => report !== null),
            map((report) => NotificationsActions.retrievedAbsenceReport({ report })),
            catchError((error: unknown) =>
              of(NotificationsActions.loadAbsenceReportFailure({ error })),
            ),
          ),
        ),
      ),
    ),
  );

  showFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(
          NotificationsActions.loadNotificationsFailure,
          NotificationsActions.markNotificationsReadFailure,
          NotificationsActions.setAutoPauseFailure,
          NotificationsActions.loadAbsenceReportFailure,
        ),
        tap((action) => {
          switch (action.type) {
            case NotificationsActions.loadNotificationsFailure.type:
              this.#toastService.error(notificationFailureMessage('load', action.error));
              break;
            case NotificationsActions.markNotificationsReadFailure.type:
              this.#toastService.error(notificationFailureMessage('markRead', action.error));
              break;
            case NotificationsActions.setAutoPauseFailure.type:
              this.#toastService.error(notificationFailureMessage('setAutoPause', action.error));
              break;
            case NotificationsActions.loadAbsenceReportFailure.type:
              this.#toastService.error(notificationFailureMessage('absenceReport', action.error));
              break;
          }
        }),
      ),
    { dispatch: false },
  );

  /**
   * Runs `work` for the entered player from its reply to `loadPlayer` on, until the game is left
   * or another player is entered.
   */
  #afterLoad<T>(work: () => Observable<T>): Observable<T> {
    return this.#actions$.pipe(
      ofType(SessionActions.enterGame),
      switchMap(({ profile }) =>
        this.#actions$.pipe(
          ofType(SessionActions.loadPlayerSuccess),
          filter(({ loaded }) => loaded.playerId === profile.id),
          take(1),
          switchMap(work),
          takeUntil(this.#ended$),
        ),
      ),
    );
  }

  /** The bundling window, a pending task while it is open. */
  #window(): Observable<unknown> {
    return defer(() => {
      const done = this.#pendingTasks.add();
      return timer(TOAST_BUNDLE_WINDOW_MS).pipe(finalize(done));
    });
  }

  /** The first load, then filter and page, new notifications and a failed marking. */
  #centerTriggers(): Observable<unknown> {
    return merge(
      of(null),
      this.#actions$.pipe(
        ofType(
          NotificationsActions.selectedNotificationCategory,
          NotificationsActions.selectedNotificationsPage,
          NotificationsActions.markNotificationsReadFailure,
        ),
      ),
      this.#store.pipe(select(selectLastSeq), distinctUntilChanged(), skip(1)),
    );
  }
}

/** One notification with its text, several of one code with their number (TS §12). */
function toastMessage(bundle: NotificationBundle, accountNames: AccountNames): string {
  if (bundle.count > 1) {
    return `${notificationCountLabel(bundle.severity, bundle.count)}: ${notificationCodeLabel(bundle.code)}`;
  }
  const { title, text } = notificationText(bundle.latest, accountNames);
  return text === '' ? title : `${title}: ${text}`;
}
