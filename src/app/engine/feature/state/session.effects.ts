import { DOCUMENT, inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { concatLatestFrom } from '@ngrx/operators';
import { select, Store } from '@ngrx/store';
import {
  catchError,
  concatMap,
  distinctUntilChanged,
  EMPTY,
  filter,
  fromEvent,
  ignoreElements,
  map,
  merge,
  mergeMap,
  Observable,
  of,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs';

import { Tick } from '@app/clock/domain/models/time.model';
import * as ClockSelectors from '@app/clock/feature/state/clock.selectors';
import { LocalStorageService } from '@app/persistence/data-access/local-storage/local-storage.service';
import { ToastService } from '@app/shared/ui/toast/toast.service';

import * as SessionActions from './session.actions';
import { GameRejection } from './session.model';
import * as SessionSelectors from './session.selectors';
import { isEngineCommandError } from './session.utils';

import { EngineService } from '../../data-access/service/engine.service';
import { lastTickOf, withLastTick } from '../../domain/last-tick-logic';
import { LAST_TICK_VERSION } from '../../domain/models/last-tick.model';

@Injectable()
export class SessionEffects {
  readonly #actions$ = inject(Actions);
  readonly #store = inject(Store);
  readonly #engine = inject(EngineService);
  readonly #localStorage = inject(LocalStorageService);
  readonly #router = inject(Router);
  readonly #toastService = inject(ToastService);
  readonly #document = inject(DOCUMENT);

  readonly #left$ = this.#actions$.pipe(ofType(SessionActions.leaveGame));

  /**
   * Visibility for the engine (TS §3.6): first the current one, then every change; `pagehide`
   * counts as hidden, so the worker writes a snapshot while it still can (TS §9.2).
   */
  reportVisibility$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(SessionActions.enterGame),
        switchMap(() =>
          merge(
            of(this.#isVisible()),
            fromEvent(this.#document, 'visibilitychange').pipe(map(() => this.#isVisible())),
            this.#windowEvent('pageshow').pipe(map(() => this.#isVisible())),
            this.#windowEvent('pagehide').pipe(map(() => false)),
          ).pipe(distinctUntilChanged(), takeUntil(this.#left$)),
        ),
        mergeMap((visible) => this.#engine.setVisibility(visible).pipe(catchError(() => EMPTY))),
      ),
    { dispatch: false },
  );

  /**
   * Chromium freezes hidden pages (`freeze` until `resume`); the engine counts the time in between
   * only in real time (TS §3.6).
   */
  reportFrozen$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(SessionActions.enterGame),
        switchMap(() =>
          merge(
            fromEvent(this.#document, 'freeze').pipe(map(() => true)),
            fromEvent(this.#document, 'resume').pipe(map(() => false)),
          ).pipe(takeUntil(this.#left$)),
        ),
        mergeMap((frozen) => this.#engine.setFrozen(frozen).pipe(catchError(() => EMPTY))),
      ),
    { dispatch: false },
  );

  loadPlayer$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(SessionActions.enterGame),
      switchMap(({ profile }) =>
        this.#readLastTick(profile.id).pipe(
          switchMap((minTick) =>
            this.#engine.loadPlayer({
              playerId: profile.id,
              seed: profile.seed,
              start: profile.start,
              minTick,
            }),
          ),
          map((loaded) => SessionActions.loadPlayerSuccess({ loaded })),
          catchError((error: unknown) => of(SessionActions.loadPlayerFailure({ error }))),
        ),
      ),
    ),
  );

  unloadPlayer$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(SessionActions.leaveGame),
      concatMap(() =>
        this.#engine.unloadPlayer().pipe(
          map(() => SessionActions.unloadPlayerSuccess()),
          catchError((error: unknown) => of(SessionActions.unloadPlayerFailure({ error }))),
        ),
      ),
    ),
  );

  watchEngine$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(SessionActions.enterGame),
      switchMap(() =>
        merge(
          this.#engine.progress$.pipe(
            map((progress) => SessionActions.retrievedProgress({ progress })),
          ),
          this.#engine.warning$.pipe(map((warning) => SessionActions.receivedWarning({ warning }))),
          this.#engine.fatal$.pipe(map((fatal) => SessionActions.receivedFatal({ fatal }))),
        ).pipe(takeUntil(this.#left$)),
      ),
    ),
  );

  /**
   * Saves the tick of the last `clock` event synchronously at `pagehide` (E-08, TS §9.2): the
   * worker's own write may not finish before the page ends, and `loadPlayer` replays at least up to
   * this tick next time.
   */
  saveLastTick$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(SessionActions.enterGame),
        switchMap(() => this.#windowEvent('pagehide').pipe(takeUntil(this.#left$))),
        concatLatestFrom(() => [
          this.#store.pipe(select(SessionSelectors.selectPlayerId)),
          this.#store.pipe(select(ClockSelectors.selectTick)),
        ]),
        filter(
          (latest): latest is [Event, string, Tick] => latest[1] !== null && latest[2] !== null,
        ),
        concatMap(([, playerId, tick]) => this.#writeLastTick(playerId, tick)),
      ),
    { dispatch: false },
  );

  /** Only the engine can tell a stored game of another `schemaVersion` (TS §15). */
  leaveOutdated$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(SessionActions.loadPlayerFailure),
        filter(({ error }) => isEngineCommandError(error, 'player-outdated')),
        tap(() => {
          this.#toastService.warning(rejectionMessage('outdated'));
          void this.#router.navigate(['/players']);
        }),
      ),
    { dispatch: false },
  );

  showRejection$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(SessionActions.rejectedGame),
        tap(({ reason }) => this.#toastService.warning(rejectionMessage(reason))),
      ),
    { dispatch: false },
  );

  showWarning$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(SessionActions.receivedWarning),
        tap(({ warning }) => {
          if (warning.code === 'storage-full') {
            this.#toastService.error(
              $localize`:@@featureEngine-sessionEffects-storageFull:Der Speicher ist voll. Das Spiel wurde pausiert. Exportiere deinen Spielstand und lösche alte Spieler; den belegten Speicher zeigen die Einstellungen unter „App“.`,
            );
          } else {
            this.#toastService.warning(
              $localize`:@@featureEngine-sessionEffects-storageWarning:Der Spielstand konnte gerade nicht gespeichert werden. PortfoliGo versucht es weiter.`,
            );
          }
        }),
      ),
    { dispatch: false },
  );

  showUnloadFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(SessionActions.unloadPlayerFailure),
        tap(() =>
          this.#toastService.error(
            $localize`:@@featureEngine-sessionEffects-unloadFailure:Der Spielstand konnte beim Verlassen nicht gespeichert werden.`,
          ),
        ),
      ),
    { dispatch: false },
  );

  /** A failed game starts over with a new page (TS §8.5): new worker, new failure count. */
  reload$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(SessionActions.clickedReload),
        tap(() => this.#document.location.reload()),
      ),
    { dispatch: false },
  );

  #isVisible(): boolean {
    return this.#document.visibilityState !== 'hidden';
  }

  #windowEvent(type: 'pageshow' | 'pagehide'): Observable<Event> {
    const view = this.#document.defaultView;
    return view === null ? EMPTY : fromEvent(view, type);
  }

  /** A broken or missing entry gives no lower bound. */
  #readLastTick(playerId: string): Observable<Tick | undefined> {
    return this.#localStorage.get<unknown>('pgo.lastTick', LAST_TICK_VERSION).pipe(
      map((data) => lastTickOf(data, playerId)),
      catchError(() => of(undefined)),
    );
  }

  /** Runs synchronously: localStorage is synchronous, and the page may end right after. */
  #writeLastTick(playerId: string, tick: Tick): Observable<never> {
    return this.#localStorage.get<unknown>('pgo.lastTick', LAST_TICK_VERSION).pipe(
      switchMap((data) =>
        this.#localStorage.set(
          'pgo.lastTick',
          LAST_TICK_VERSION,
          withLastTick(data, playerId, tick),
        ),
      ),
      ignoreElements(),
      catchError(() => EMPTY),
    );
  }
}

function rejectionMessage(reason: GameRejection): string {
  switch (reason) {
    case 'not-found':
      return $localize`:@@featureEngine-sessionEffects-playerNotFound:Diesen Spieler gibt es nicht.`;
    case 'outdated':
      return $localize`:@@featureEngine-sessionEffects-playerOutdated:Dieser Spieler stammt aus einer älteren Version von PortfoliGo und kann nur noch gelöscht werden.`;
    case 'unavailable':
      return $localize`:@@featureEngine-sessionEffects-playerUnavailable:Der Spieler konnte nicht geöffnet werden.`;
  }
}
