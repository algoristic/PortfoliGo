import { Dialog } from '@angular/cdk/dialog';
import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { concatLatestFrom } from '@ngrx/operators';
import { select, Store } from '@ngrx/store';
import {
  catchError,
  concat,
  concatMap,
  EMPTY,
  exhaustMap,
  filter,
  forkJoin,
  ignoreElements,
  map,
  mergeMap,
  Observable,
  of,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs';

import { PlayerListEntry } from '@app/players/domain/models/player.model';
import { normalizePlayerName } from '@app/players/domain/player-logic';
import { openConfirmDialog } from '@app/shared/ui/dialog-confirm/dialog-confirm.utils';
import { ToastService } from '@app/shared/ui/toast/toast.service';

import * as PlayersActions from './players.actions';
import * as PlayersSelectors from './players.selectors';

import { isPlayersServiceError } from '../../data-access/service/players-service.utils';
import { PlayersService } from '../../data-access/service/players.service';
import { DialogRenamePlayerComponent } from '../dialog-rename-player/dialog-rename-player.component';
import {
  RenamePlayerDialogData,
  RenamePlayerDialogResult,
} from '../dialog-rename-player/dialog-rename-player.model';

@Injectable()
export class PlayersEffects {
  readonly #actions$ = inject(Actions);
  readonly #store = inject(Store);
  readonly #service = inject(PlayersService);
  readonly #dialog = inject(Dialog);
  readonly #router = inject(Router);
  readonly #toastService = inject(ToastService);

  // Failed changes reload the list: another tab may have changed or deleted the player.
  loadPlayers$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(
        PlayersActions.enterPlayersPage,
        PlayersActions.receivedPlayersChange,
        PlayersActions.renamePlayerFailure,
        PlayersActions.deletePlayerFailure,
      ),
      switchMap(() =>
        forkJoin([this.#service.loadPlayers(), this.#service.getLastPlayerId()]).pipe(
          map(([players, lastPlayerId]) =>
            PlayersActions.retrievedPlayers({ players, lastPlayerId }),
          ),
          catchError((error: unknown) => of(PlayersActions.loadPlayersFailure({ error }))),
        ),
      ),
    ),
  );

  watchChanges$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PlayersActions.enterPlayersPage),
      switchMap(() =>
        this.#service.changes$.pipe(
          map((change) => PlayersActions.receivedPlayersChange({ change })),
          takeUntil(this.#actions$.pipe(ofType(PlayersActions.leavePlayersPage))),
        ),
      ),
    ),
  );

  openPlayer$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(PlayersActions.clickedOpenPlayer),
        concatLatestFrom(() => this.#store.pipe(select(PlayersSelectors.selectPlayers))),
        map(([{ playerId }, players]) => findPlayer(players, playerId)),
        filter((player): player is PlayerListEntry => player !== undefined && !player.outdated),
        concatMap((player) => this.#rememberPlayer(player.id).pipe(map(() => player.id))),
        tap((playerId) => void this.#router.navigate(['/game', playerId])),
      ),
    { dispatch: false },
  );

  openRenameDialog$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PlayersActions.clickedRenamePlayer),
      concatLatestFrom(() => this.#store.pipe(select(PlayersSelectors.selectPlayers))),
      map(([{ playerId }, players]) => findPlayer(players, playerId)),
      filter((player): player is PlayerListEntry => player !== undefined && !player.outdated),
      exhaustMap((player) =>
        this.#dialog
          .open<RenamePlayerDialogResult, RenamePlayerDialogData>(DialogRenamePlayerComponent, {
            data: { name: player.name },
            ariaLabel: $localize`:@@featurePlayers-playersEffects-renameDialogLabel:Spieler umbenennen`,
            autoFocus: 'input',
            width: '28rem',
            maxWidth: 'calc(100vw - 2rem)',
            maxHeight: 'calc(100dvh - 2rem)',
          })
          .closed.pipe(
            filter(
              (name): name is string =>
                name !== undefined && normalizePlayerName(name) !== player.name,
            ),
            map((name) => PlayersActions.submittedPlayerName({ playerId: player.id, name })),
          ),
      ),
    ),
  );

  renamePlayer$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PlayersActions.submittedPlayerName),
      mergeMap(({ playerId, name }) =>
        this.#service.renamePlayer(playerId, name).pipe(
          map((profile) => PlayersActions.renamePlayerSuccess({ profile })),
          catchError((error: unknown) => of(PlayersActions.renamePlayerFailure({ error }))),
        ),
      ),
    ),
  );

  confirmDelete$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PlayersActions.clickedDeletePlayer),
      concatLatestFrom(() => this.#store.pipe(select(PlayersSelectors.selectPlayers))),
      map(([{ playerId }, players]) => findPlayer(players, playerId)),
      filter((player): player is PlayerListEntry => player !== undefined),
      exhaustMap(({ id, name }) =>
        openConfirmDialog(this.#dialog, {
          heading: $localize`:@@featurePlayers-playersEffects-deleteHeading:Spieler löschen?`,
          message: $localize`:@@featurePlayers-playersEffects-deleteMessage:„${name}:name:“ wird mit allen Spieldaten endgültig gelöscht. Das lässt sich nicht rückgängig machen.`,
          confirmLabel: $localize`:@@featurePlayers-playersEffects-deleteConfirm:Löschen`,
          tone: 'danger',
        }).pipe(
          filter(Boolean),
          map(() => PlayersActions.confirmedDeletePlayer({ playerId: id, name })),
        ),
      ),
    ),
  );

  deletePlayer$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PlayersActions.confirmedDeletePlayer),
      mergeMap(({ playerId, name }) =>
        this.#service.deletePlayer(playerId).pipe(
          map(() => PlayersActions.deletePlayerSuccess({ playerId, name })),
          catchError((error: unknown) => of(PlayersActions.deletePlayerFailure({ name, error }))),
        ),
      ),
    ),
  );

  suggestSeed$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PlayersActions.enterNewPlayerPage, PlayersActions.clickedSuggestSeed),
      map(() => PlayersActions.suggestedSeed({ seed: this.#service.suggestSeed() })),
    ),
  );

  /** Persistent storage is requested once, after the first player (TS §9.5). */
  createPlayer$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PlayersActions.submittedNewPlayer),
      exhaustMap(({ newPlayer }) =>
        this.#service.createPlayer(newPlayer).pipe(
          concatMap(({ profile, firstPlayer }) =>
            concat(
              firstPlayer ? this.#service.requestPersistence().pipe(ignoreElements()) : EMPTY,
              this.#rememberPlayer(profile.id).pipe(ignoreElements()),
              of(PlayersActions.createPlayerSuccess({ profile })),
            ),
          ),
          catchError((error: unknown) => of(PlayersActions.createPlayerFailure({ error }))),
        ),
      ),
    ),
  );

  openCreatedPlayer$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(PlayersActions.createPlayerSuccess),
        tap(({ profile }) => void this.#router.navigate(['/game', profile.id])),
      ),
    { dispatch: false },
  );

  showDeleted$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(PlayersActions.deletePlayerSuccess),
        tap(({ name }) =>
          this.#toastService.success(
            $localize`:@@featurePlayers-playersEffects-deleteSuccess:„${name}:name:“ wurde gelöscht.`,
          ),
        ),
      ),
    { dispatch: false },
  );

  showDeleteFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(PlayersActions.deletePlayerFailure),
        tap(({ name, error }) => {
          if (isPlayersServiceError(error, 'player-locked')) {
            this.#toastService.warning(
              $localize`:@@featurePlayers-playersEffects-deleteLocked:„${name}:name:“ ist in einem anderen Tab geöffnet und lässt sich gerade nicht löschen. Schließe den Spieler dort und versuche es erneut.`,
            );
          } else {
            this.#toastService.error(
              $localize`:@@featurePlayers-playersEffects-deleteFailure:„${name}:name:“ konnte nicht gelöscht werden.`,
            );
          }
        }),
      ),
    { dispatch: false },
  );

  showRenameFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(PlayersActions.renamePlayerFailure),
        tap(({ error }) => this.#toastService.error(renameFailureMessage(error))),
      ),
    { dispatch: false },
  );

  showFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(PlayersActions.loadPlayersFailure, PlayersActions.createPlayerFailure),
        tap((action) =>
          this.#toastService.error(
            action.type === PlayersActions.loadPlayersFailure.type
              ? $localize`:@@featurePlayers-playersEffects-loadFailure:Die Spieler konnten nicht geladen werden.`
              : $localize`:@@featurePlayers-playersEffects-createFailure:Der Spieler konnte nicht angelegt werden.`,
          ),
        ),
      ),
    { dispatch: false },
  );

  /** Remembers the player for the next start (TS §9.3); a full localStorage doesn't block it. */
  #rememberPlayer(playerId: string): Observable<void> {
    return this.#service.setLastPlayerId(playerId).pipe(catchError(() => of(undefined)));
  }
}

function findPlayer(players: PlayerListEntry[], playerId: string): PlayerListEntry | undefined {
  return players.find((player) => player.id === playerId);
}

function renameFailureMessage(error: unknown): string {
  if (isPlayersServiceError(error, 'player-not-found')) {
    return $localize`:@@featurePlayers-playersEffects-renameNotFound:Den Spieler gibt es nicht mehr.`;
  }
  if (isPlayersServiceError(error, 'invalid-input')) {
    return $localize`:@@featurePlayers-playersEffects-renameInvalid:Der Name ist ungültig.`;
  }
  return $localize`:@@featurePlayers-playersEffects-renameFailure:Der Spieler konnte nicht umbenannt werden.`;
}
