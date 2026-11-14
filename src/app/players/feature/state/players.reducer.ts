import { Action, createReducer, on } from '@ngrx/store';

import { PlayerBackupStatus } from '@app/players/domain/models/backup.model';
import { PlayerListEntry } from '@app/players/domain/models/player.model';

import * as PlayersActions from './players.actions';

export const PLAYERS_FEATURE_KEY = 'players';

export interface PlayersState {
  /** Most recently used first (as the service sorts them). */
  players: PlayerListEntry[];
  loaded: boolean;
  lastPlayerId?: string;
  /** Seed the form „Spieler anlegen“ starts with. */
  suggestedSeed?: string;
  creating: boolean;
  importing: boolean;
  /** Market days of the import's history run (TS §10.3); `null` until the worker reports. */
  importProgress: { done: number; total: number } | null;
  exporting: boolean;
  /** Last export and reminder interval of the open game's player (`pgo.backup`, TS §9.3). */
  backup: PlayerBackupStatus | null;
  error?: unknown;
}

export const initialPlayersState: PlayersState = {
  players: [],
  loaded: false,
  creating: false,
  importing: false,
  importProgress: null,
  exporting: false,
  backup: null,
};

const reducer = createReducer(
  initialPlayersState,
  on(PlayersActions.retrievedPlayers, (state, { players, lastPlayerId }) => ({
    ...state,
    players,
    lastPlayerId,
    loaded: true,
  })),
  on(PlayersActions.loadPlayersFailure, (state, { error }) => ({ ...state, loaded: true, error })),
  on(PlayersActions.clickedOpenPlayer, (state, { playerId }) => ({
    ...state,
    lastPlayerId: playerId,
  })),
  on(PlayersActions.enterNewPlayerPage, (state) => ({ ...state, creating: false })),
  on(PlayersActions.suggestedSeed, (state, { seed }) => ({ ...state, suggestedSeed: seed })),
  on(PlayersActions.submittedNewPlayer, (state) => ({ ...state, creating: true })),
  on(PlayersActions.createPlayerSuccess, (state, { profile }) => ({
    ...state,
    creating: false,
    lastPlayerId: profile.id,
  })),
  on(PlayersActions.createPlayerFailure, (state, { error }) => ({
    ...state,
    creating: false,
    error,
  })),
  on(PlayersActions.submittedImportPlayer, (state) => ({
    ...state,
    importing: true,
    importProgress: null,
  })),
  on(PlayersActions.retrievedImportProgress, (state, { done, total }) =>
    state.importing ? { ...state, importProgress: { done, total } } : state,
  ),
  on(PlayersActions.importPlayerSuccess, (state, { profile }) => ({
    ...state,
    importing: false,
    importProgress: null,
    lastPlayerId: profile.id,
  })),
  on(PlayersActions.importPlayerFailure, (state, { error }) => ({
    ...state,
    importing: false,
    importProgress: null,
    error,
  })),
  on(PlayersActions.clickedExportPlayer, (state) => ({ ...state, exporting: true })),
  on(PlayersActions.exportPlayerSuccess, (state) => ({ ...state, exporting: false })),
  on(PlayersActions.exportPlayerFailure, (state, { error }) => ({
    ...state,
    exporting: false,
    error,
  })),
  on(PlayersActions.loadedBackup, (state, { backup }) => ({ ...state, backup })),
  // Only the open player's status is kept; a late answer for another player changes nothing.
  on(PlayersActions.recordedExport, (state, { playerId, exportedAt }) =>
    state.backup?.playerId === playerId
      ? { ...state, backup: { ...state.backup, exportedAt } }
      : state,
  ),
  on(PlayersActions.selectedBackupInterval, (state, { intervalDays }) =>
    state.backup === null ? state : { ...state, backup: { ...state.backup, intervalDays } },
  ),
  // Renaming keeps the position: the order follows the last use, not the name.
  on(PlayersActions.renamePlayerSuccess, (state, { profile }) => ({
    ...state,
    players: state.players.map((player) =>
      player.id === profile.id ? { ...player, name: profile.name } : player,
    ),
  })),
  on(PlayersActions.deletePlayerSuccess, (state, { playerId }) => ({
    ...state,
    players: state.players.filter((player) => player.id !== playerId),
    lastPlayerId: state.lastPlayerId === playerId ? undefined : state.lastPlayerId,
  })),
  on(
    PlayersActions.renamePlayerFailure,
    PlayersActions.deletePlayerFailure,
    (state, { error }) => ({ ...state, error }),
  ),
);

export function playersReducer(state: PlayersState | undefined, action: Action): PlayersState {
  return reducer(state, action);
}
