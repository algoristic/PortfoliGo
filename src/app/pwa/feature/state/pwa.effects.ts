import { inject, Injectable, PendingTasks } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { concatLatestFrom } from '@ngrx/operators';
import { select, Store } from '@ngrx/store';
import {
  catchError,
  defer,
  exhaustMap,
  finalize,
  from,
  map,
  merge,
  of,
  switchMap,
  tap,
} from 'rxjs';

import { NOTIFICATION_PORT } from '@app/notifications/data-access/notification-port/notification-port';
import { STORAGE_PERSISTENCE } from '@app/players/data-access/service/players-service.config';
import {
  APP_UPDATE,
  INSTALL_PROMPT,
  PLATFORM_INFO,
  STORAGE_ESTIMATE,
} from '@app/pwa/data-access/platform/platform';
import { StorageStatus } from '@app/pwa/domain/models/pwa.model';
import { ToastService } from '@app/shared/ui/toast/toast.service';

import * as PwaActions from './pwa.actions';
import { selectUpdate } from './pwa.selectors';

@Injectable()
export class PwaEffects {
  readonly #actions$ = inject(Actions);
  readonly #store = inject(Store);
  readonly #platform = inject(PLATFORM_INFO);
  readonly #installPrompt = inject(INSTALL_PROMPT);
  readonly #appUpdate = inject(APP_UPDATE);
  readonly #storageEstimate = inject(STORAGE_ESTIMATE);
  readonly #persistence = inject(STORAGE_PERSISTENCE);
  readonly #notificationPort = inject(NOTIFICATION_PORT);
  readonly #toastService = inject(ToastService);
  readonly #pendingTasks = inject(PendingTasks);

  loadPlatform$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PwaActions.enterApp),
      map(() => PwaActions.retrievedPlatform({ platform: this.#platform })),
    ),
  );

  /** New and broken versions from the service worker (US-UI-07, TS §13). */
  watchUpdates$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PwaActions.enterApp),
      switchMap(() => this.#appUpdate.events$),
      map((event) => PwaActions.receivedAppUpdate({ event })),
    ),
  );

  watchInstallPrompt$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PwaActions.enterApp),
      switchMap(() =>
        merge(
          this.#installPrompt.available$.pipe(
            map((available) => PwaActions.receivedInstallAvailability({ available })),
          ),
          this.#installPrompt.installed$.pipe(map(() => PwaActions.receivedAppInstalled())),
        ),
      ),
    ),
  );

  /** The browser's dialog; it has to open during the click, so nothing runs before it. */
  install$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PwaActions.clickedInstall),
      exhaustMap(() =>
        defer(() => this.#installPrompt.prompt()).pipe(
          map((outcome) => PwaActions.installPromptSuccess({ outcome })),
          catchError((error: unknown) => of(PwaActions.installPromptFailure({ error }))),
        ),
      ),
    ),
  );

  /** The permission as it is now: at the start and whenever the settings page opens. */
  loadNotificationPermission$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PwaActions.enterApp, PwaActions.enterAppSettings),
      map(() =>
        PwaActions.retrievedNotificationPermission({
          permission: this.#notificationPort.permission(),
        }),
      ),
    ),
  );

  /** Asks the user (US-BN-04); only from the click, browsers ignore requests without one. */
  requestNotificationPermission$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PwaActions.clickedRequestNotificationPermission),
      exhaustMap(() =>
        defer(() => this.#notificationPort.requestPermission()).pipe(
          map((permission) => PwaActions.retrievedNotificationPermission({ permission })),
          catchError((error: unknown) =>
            of(PwaActions.requestNotificationPermissionFailure({ error })),
          ),
        ),
      ),
    ),
  );

  /**
   * Used and available storage and whether it is persistent (US-EX-03, TS §9.5), when the
   * settings page opens and after a request. A pending task while it loads.
   */
  loadStorageStatus$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PwaActions.enterAppSettings, PwaActions.requestPersistentStorageSuccess),
      switchMap(() =>
        defer(() => {
          const done = this.#pendingTasks.add();
          return from(this.#storageStatus()).pipe(finalize(done));
        }).pipe(map((status) => PwaActions.retrievedStorageStatus({ status }))),
      ),
    ),
  );

  /**
   * Asks again for persistent storage; the first request follows the first player (TS §9.5).
   * Not a pending task: Firefox answers only after its prompt.
   */
  requestPersistentStorage$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PwaActions.clickedRequestPersistentStorage),
      exhaustMap(() =>
        defer(() => this.#persistence.persist().catch(() => false)).pipe(
          map((persisted) => PwaActions.requestPersistentStorageSuccess({ persisted })),
        ),
      ),
    ),
  );

  /** „Neu laden“: activates a loaded version first; a broken cache only reloads (TS §13). */
  reload$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(PwaActions.clickedReload),
        concatLatestFrom(() => this.#store.pipe(select(selectUpdate))),
        exhaustMap(([, update]) => this.#appUpdate.reload(update === 'version-ready')),
      ),
    { dispatch: false },
  );

  showInstalled$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(PwaActions.receivedAppInstalled),
        tap(() =>
          this.#toastService.success(
            $localize`:@@featurePwa-pwaEffects-installed:PortfoliGo ist jetzt als App installiert.`,
          ),
        ),
      ),
    { dispatch: false },
  );

  showFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(PwaActions.installPromptFailure, PwaActions.requestNotificationPermissionFailure),
        tap((action) =>
          this.#toastService.error(
            action.type === PwaActions.installPromptFailure.type
              ? $localize`:@@featurePwa-pwaEffects-installFailure:Die Installation konnte nicht gestartet werden.`
              : $localize`:@@featurePwa-pwaEffects-permissionFailure:Die Erlaubnis für Benachrichtigungen konnte nicht angefragt werden.`,
          ),
        ),
      ),
    { dispatch: false },
  );

  async #storageStatus(): Promise<StorageStatus> {
    const [estimate, persisted] = await Promise.all([
      this.#storageEstimate.estimate().catch(() => null),
      this.#persistence.persisted().catch(() => null),
    ]);
    return { usage: estimate?.usage ?? null, quota: estimate?.quota ?? null, persisted };
  }
}
