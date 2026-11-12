import { Action, createReducer, on } from '@ngrx/store';

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
  error?: unknown;
}

export const initialPlayersState: PlayersState = { players: [], loaded: false, creating: false };

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
