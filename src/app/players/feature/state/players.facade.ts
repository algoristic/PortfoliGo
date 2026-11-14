import { inject, Injectable } from '@angular/core';
import { select, Store } from '@ngrx/store';

import { BackupIntervalDays } from '@app/players/domain/models/backup.model';
import { NewPlayer } from '@app/players/domain/models/player.model';

import * as PlayersActions from './players.actions';
import * as PlayersSelectors from './players.selectors';

@Injectable()
export class PlayersFacade {
  readonly #store = inject(Store);

  players$ = this.#store.pipe(select(PlayersSelectors.selectPlayers));
  loaded$ = this.#store.pipe(select(PlayersSelectors.selectLoaded));
  lastPlayerId$ = this.#store.pipe(select(PlayersSelectors.selectLastPlayerId));
  suggestedSeed$ = this.#store.pipe(select(PlayersSelectors.selectSuggestedSeed));
  creating$ = this.#store.pipe(select(PlayersSelectors.selectCreating));
  importing$ = this.#store.pipe(select(PlayersSelectors.selectImporting));
  importRatio$ = this.#store.pipe(select(PlayersSelectors.selectImportRatio));
  exporting$ = this.#store.pipe(select(PlayersSelectors.selectExporting));
  backup$ = this.#store.pipe(select(PlayersSelectors.selectBackup));

  enterPlayersPage(): void {
    this.#store.dispatch(PlayersActions.enterPlayersPage());
  }

  leavePlayersPage(): void {
    this.#store.dispatch(PlayersActions.leavePlayersPage());
  }

  enterNewPlayerPage(): void {
    this.#store.dispatch(PlayersActions.enterNewPlayerPage());
  }

  openPlayer(playerId: string): void {
    this.#store.dispatch(PlayersActions.clickedOpenPlayer({ playerId }));
  }

  renamePlayer(playerId: string): void {
    this.#store.dispatch(PlayersActions.clickedRenamePlayer({ playerId }));
  }

  /** Renames the player of the open game (PS US-UI-09). */
  renameOpenPlayer(): void {
    this.#store.dispatch(PlayersActions.clickedRenameOpenPlayer());
  }

  copiedSeed(copied: boolean): void {
    this.#store.dispatch(PlayersActions.copiedSeed({ copied }));
  }

  deletePlayer(playerId: string): void {
    this.#store.dispatch(PlayersActions.clickedDeletePlayer({ playerId }));
  }

  suggestSeed(): void {
    this.#store.dispatch(PlayersActions.clickedSuggestSeed());
  }

  createPlayer(newPlayer: NewPlayer): void {
    this.#store.dispatch(PlayersActions.submittedNewPlayer({ newPlayer }));
  }

  importPlayer(): void {
    this.#store.dispatch(PlayersActions.clickedImportPlayer());
  }

  /** Exports the player of the open game (TS §10.2). */
  exportPlayer(): void {
    this.#store.dispatch(PlayersActions.clickedExportPlayer());
  }

  selectBackupInterval(intervalDays: BackupIntervalDays | null): void {
    this.#store.dispatch(PlayersActions.selectedBackupInterval({ intervalDays }));
  }
}
