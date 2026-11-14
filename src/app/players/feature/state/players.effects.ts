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
  take,
  takeUntil,
  tap,
} from 'rxjs';

import { EngineCommandError } from '@app/engine/data-access/service/engine.service';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { selectPlayerId, selectPlayerName } from '@app/engine/feature/state/session.selectors';
import { isEngineCommandError } from '@app/engine/feature/state/session.utils';
import { PlayerListEntry } from '@app/players/domain/models/player.model';
import { normalizePlayerName } from '@app/players/domain/player-logic';
import { openConfirmDialog } from '@app/shared/ui/dialog-confirm/dialog-confirm.utils';
import { ToastService } from '@app/shared/ui/toast/toast.service';

import * as PlayersActions from './players.actions';
import * as PlayersSelectors from './players.selectors';

import { isPlayersServiceError } from '../../data-access/service/players-service.utils';
import { PlayersService } from '../../data-access/service/players.service';
import { DialogExportPlayerComponent } from '../dialog-export-player/dialog-export-player.component';
import {
  ExportPlayerDialogData,
  ExportPlayerDialogResult,
  ExportSaveTarget,
} from '../dialog-export-player/dialog-export-player.model';
import { DialogImportPlayerComponent } from '../dialog-import-player/dialog-import-player.component';
import { ImportPlayerDialogResult } from '../dialog-import-player/dialog-import-player.model';
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

  createPlayer$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PlayersActions.submittedNewPlayer),
      exhaustMap(({ newPlayer }) =>
        this.#service.createPlayer(newPlayer).pipe(
          concatMap(({ profile, firstPlayer }) =>
            this.#rememberPlayer(profile.id).pipe(
              map(() => PlayersActions.createPlayerSuccess({ profile, firstPlayer })),
            ),
          ),
          catchError((error: unknown) => of(PlayersActions.createPlayerFailure({ error }))),
        ),
      ),
    ),
  );

  /**
   * Persistent storage is requested once, after the first player (TS §9.5). The request never
   * holds up opening the player: Firefox answers only after its permission prompt.
   */
  requestPersistence$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(PlayersActions.createPlayerSuccess, PlayersActions.importPlayerSuccess),
        filter(({ firstPlayer }) => firstPlayer),
        mergeMap(() => this.#service.requestPersistence().pipe(catchError(() => EMPTY))),
      ),
    { dispatch: false },
  );

  openCreatedPlayer$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(PlayersActions.createPlayerSuccess, PlayersActions.importPlayerSuccess),
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

  /**
   * Import (US-EX-02, TS §10.3): the dialog returns the file content or the pasted text, which goes
   * to the service without passing the store; the new player gets the suffix „ (Import)“.
   */
  importPlayer$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PlayersActions.clickedImportPlayer),
      exhaustMap(() =>
        this.#dialog
          .open<ImportPlayerDialogResult>(DialogImportPlayerComponent, {
            ariaLabel: $localize`:@@featurePlayers-playersEffects-importDialogLabel:Spielstand importieren`,
            autoFocus: '[data-testid="players.import-dialog.choose-file"]',
            width: '32rem',
            maxWidth: 'calc(100vw - 2rem)',
            maxHeight: 'calc(100dvh - 2rem)',
          })
          .closed.pipe(
            filter((content): content is string => content !== undefined),
            switchMap((content) =>
              concat(
                of(PlayersActions.submittedImportPlayer()),
                this.#service
                  .importPlayer(
                    content,
                    $localize`:@@featurePlayers-playersEffects-importNameSuffix: (Import)`,
                  )
                  .pipe(
                    concatMap(({ profile, firstPlayer, marketChecksumMatches }) =>
                      this.#rememberPlayer(profile.id).pipe(
                        map(() =>
                          PlayersActions.importPlayerSuccess({
                            profile,
                            firstPlayer,
                            marketChecksumMatches,
                          }),
                        ),
                      ),
                    ),
                    catchError((error: unknown) =>
                      of(PlayersActions.importPlayerFailure({ error })),
                    ),
                  ),
              ),
            ),
          ),
      ),
    ),
  );

  trackImportProgress$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PlayersActions.submittedImportPlayer),
      switchMap(() =>
        this.#service.importProgress$.pipe(
          filter(({ state }) => state === 'running'),
          map(({ done, total }) => PlayersActions.retrievedImportProgress({ done, total })),
          takeUntil(
            this.#actions$.pipe(
              ofType(PlayersActions.importPlayerSuccess, PlayersActions.importPlayerFailure),
            ),
          ),
        ),
      ),
    ),
  );

  /** A different market checksum is a hint, not an error: the game uses the exported market. */
  showImported$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(PlayersActions.importPlayerSuccess),
        tap(({ profile, marketChecksumMatches }) => {
          this.#toastService.success(
            $localize`:@@featurePlayers-playersEffects-importSuccess:„${profile.name}:name:“ wurde importiert. Das Spiel ist pausiert.`,
          );
          if (!marketChecksumMatches) {
            this.#toastService.warning(
              $localize`:@@featurePlayers-playersEffects-importChecksumMismatch:Die nachgerechneten Kurse weichen vom Export ab. Das Spiel läuft mit dem exportierten Marktzustand weiter.`,
              { durationMs: 0 },
            );
          }
        }),
      ),
    { dispatch: false },
  );

  showImportFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(PlayersActions.importPlayerFailure),
        tap(({ error }) => this.#toastService.error(importFailureMessage(error))),
      ),
    { dispatch: false },
  );

  /**
   * Export of the open game's player (US-EX-01, TS §10.2): the worker builds the file, a dialog
   * offers download and clipboard. The content never enters the store.
   */
  exportPlayer$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PlayersActions.clickedExportPlayer),
      concatLatestFrom(() => [
        this.#store.pipe(select(selectPlayerId)),
        this.#store.pipe(select(selectPlayerName)),
      ]),
      exhaustMap(([, playerId, name]) => {
        if (playerId === null || name === null) {
          return of(
            PlayersActions.exportPlayerFailure({
              error: new EngineCommandError('player-not-loaded'),
            }),
          );
        }
        return this.#service.exportPlayer(name).pipe(
          switchMap(({ fileName, content }) =>
            concat(
              of(PlayersActions.exportPlayerSuccess({ playerId, fileName })),
              this.#dialog
                .open<ExportPlayerDialogResult, ExportPlayerDialogData>(
                  DialogExportPlayerComponent,
                  {
                    data: { fileName, content },
                    ariaLabel: $localize`:@@featurePlayers-playersEffects-exportDialogLabel:Spielstand exportieren`,
                    autoFocus: '[data-testid="players.export-dialog.download"]',
                    width: '32rem',
                    maxWidth: 'calc(100vw - 2rem)',
                    maxHeight: 'calc(100dvh - 2rem)',
                  },
                )
                .closed.pipe(
                  filter((target): target is ExportSaveTarget => target !== undefined),
                  map((target) => PlayersActions.savedPlayerExport({ playerId, target })),
                ),
            ),
          ),
          catchError((error: unknown) => of(PlayersActions.exportPlayerFailure({ error }))),
        );
      }),
    ),
  );

  showExportFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(PlayersActions.exportPlayerFailure),
        tap(({ error }) => this.#toastService.error(exportFailureMessage(error))),
      ),
    { dispatch: false },
  );

  showCopied$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(PlayersActions.savedPlayerExport),
        filter(({ target }) => target === 'clipboard'),
        tap(() =>
          this.#toastService.success(
            $localize`:@@featurePlayers-playersEffects-exportCopied:Der Spielstand ist in der Zwischenablage.`,
          ),
        ),
      ),
    { dispatch: false },
  );

  /** The time of a saved export goes to `pgo.backup` (TS §9.3). */
  recordExport$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PlayersActions.savedPlayerExport),
      concatMap(({ playerId }) =>
        this.#service.recordExport(playerId).pipe(
          map((exportedAt) => PlayersActions.recordedExport({ playerId, exportedAt })),
          catchError((error: unknown) => of(PlayersActions.saveBackupFailure({ error }))),
        ),
      ),
    ),
  );

  loadBackup$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(SessionActions.enterGame),
      switchMap(({ profile }) =>
        this.#service.loadBackup(profile.id).pipe(
          map((backup) => PlayersActions.loadedBackup({ backup })),
          catchError(() => EMPTY),
        ),
      ),
    ),
  );

  saveBackupInterval$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(PlayersActions.selectedBackupInterval),
      concatMap(({ intervalDays }) =>
        this.#service.setBackupInterval(intervalDays).pipe(
          ignoreElements(),
          catchError((error: unknown) => of(PlayersActions.saveBackupFailure({ error }))),
        ),
      ),
    ),
  );

  showBackupFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(PlayersActions.saveBackupFailure),
        tap(() =>
          this.#toastService.error(
            $localize`:@@featurePlayers-playersEffects-backupSaveFailure:Die Angaben zur Sicherung konnten auf diesem Gerät nicht gespeichert werden.`,
          ),
        ),
      ),
    { dispatch: false },
  );

  /**
   * Backup reminder (US-EX-03, TS §9.3): once the entered player is loaded, a hint if the last
   * export (or the creation) is older than the interval; then it waits a day.
   */
  remindBackup$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(SessionActions.enterGame),
        switchMap(({ profile }) =>
          this.#actions$.pipe(
            ofType(SessionActions.loadPlayerSuccess),
            filter(({ loaded }) => loaded.playerId === profile.id),
            take(1),
            switchMap(() => this.#service.remindBackup(profile).pipe(catchError(() => of(false)))),
            filter(Boolean),
            takeUntil(this.#actions$.pipe(ofType(SessionActions.leaveGame))),
          ),
        ),
        tap(() =>
          this.#toastService.info(
            $localize`:@@featurePlayers-playersEffects-backupReminder:Sicherung empfohlen: Exportiere deinen Spielstand unter Einstellungen → Spieler. So bleibt er erhalten, auch wenn der Browser seine Daten löscht.`,
            { durationMs: 10_000 },
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

function importFailureMessage(error: unknown): string {
  if (!isEngineCommandError(error)) {
    // The profile could not be created, e.g. start conditions outside the ranges (TS §10.3).
    return $localize`:@@featurePlayers-playersEffects-importFailure:Der Spielstand konnte nicht importiert werden.`;
  }
  switch (error.code) {
    case 'invalid-encoding':
      return $localize`:@@featurePlayers-playersEffects-importUnreadable:Die Daten lassen sich nicht lesen. Prüfe, ob du die ganze Datei gewählt oder den ganzen Text eingefügt hast.`;
    case 'invalid-format':
      return $localize`:@@featurePlayers-playersEffects-importInvalid:Das ist kein PortfoliGo-Spielstand.`;
    case 'unsupported-format-version':
      return $localize`:@@featurePlayers-playersEffects-importFormatVersion:Der Spielstand hat ein Format, das diese Version von PortfoliGo nicht kennt. Aktualisiere die App und versuche es erneut.`;
    case 'checksum-mismatch':
      return $localize`:@@featurePlayers-playersEffects-importChecksum:Der Spielstand ist beschädigt oder wurde verändert: Die Prüfsumme stimmt nicht.`;
    case 'sim-version-mismatch':
    case 'schema-version-mismatch':
      return $localize`:@@featurePlayers-playersEffects-importVersion:Der Spielstand stammt aus einer anderen Version von PortfoliGo und lässt sich hier nicht fortsetzen.`;
    case 'invalid-structure':
      return $localize`:@@featurePlayers-playersEffects-importStructure:Der Spielstand ist unvollständig oder fehlerhaft und lässt sich nicht laden.`;
    case 'storage-failed':
      return $localize`:@@featurePlayers-playersEffects-importStorage:Der Spielstand konnte nicht gespeichert werden. Prüfe den freien Speicher und versuche es erneut.`;
    default:
      return $localize`:@@featurePlayers-playersEffects-importFailure:Der Spielstand konnte nicht importiert werden.`;
  }
}

function exportFailureMessage(error: unknown): string {
  if (isEngineCommandError(error, 'busy')) {
    return $localize`:@@featurePlayers-playersEffects-exportBusy:Während des Vorspulens oder der Nachberechnung lässt sich nicht exportieren. Versuche es gleich noch einmal.`;
  }
  return $localize`:@@featurePlayers-playersEffects-exportFailure:Der Spielstand konnte nicht exportiert werden.`;
}
