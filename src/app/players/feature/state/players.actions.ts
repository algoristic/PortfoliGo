import { createAction, props } from '@ngrx/store';

import { NewPlayer, PlayerListEntry, PlayerProfile } from '@app/players/domain/models/player.model';

import { PlayersChangedMessage } from '../../data-access/service/players-service.model';

export const enterPlayersPage = createAction('[Players/Page] Enter players page');
export const leavePlayersPage = createAction('[Players/Page] Leave players page');
export const clickedOpenPlayer = createAction(
  '[Players/Page] Clicked open player',
  props<{ playerId: string }>(),
);
export const clickedRenamePlayer = createAction(
  '[Players/Page] Clicked rename player',
  props<{ playerId: string }>(),
);
export const submittedPlayerName = createAction(
  '[Players/Page] Submitted player name',
  props<{ playerId: string; name: string }>(),
);
export const clickedDeletePlayer = createAction(
  '[Players/Page] Clicked delete player',
  props<{ playerId: string }>(),
);
export const confirmedDeletePlayer = createAction(
  '[Players/Page] Confirmed delete player',
  props<{ playerId: string; name: string }>(),
);

export const enterNewPlayerPage = createAction('[Players/Page] Enter new player page');
export const clickedSuggestSeed = createAction('[Players/Page] Clicked suggest seed');
export const submittedNewPlayer = createAction(
  '[Players/Page] Submitted new player',
  props<{ newPlayer: NewPlayer }>(),
);

export const retrievedPlayers = createAction(
  '[Players/API] Retrieved players',
  props<{ players: PlayerListEntry[]; lastPlayerId: string | undefined }>(),
);
export const loadPlayersFailure = createAction(
  '[Players/API] Load players failure',
  props<{ error: unknown }>(),
);
export const receivedPlayersChange = createAction(
  '[Players/API] Received players change',
  props<{ change: PlayersChangedMessage }>(),
);
export const suggestedSeed = createAction(
  '[Players/API] Suggested seed',
  props<{ seed: string }>(),
);
export const createPlayerSuccess = createAction(
  '[Players/API] Create player success',
  props<{ profile: PlayerProfile; firstPlayer: boolean }>(),
);
export const createPlayerFailure = createAction(
  '[Players/API] Create player failure',
  props<{ error: unknown }>(),
);
export const renamePlayerSuccess = createAction(
  '[Players/API] Rename player success',
  props<{ profile: PlayerProfile }>(),
);
export const renamePlayerFailure = createAction(
  '[Players/API] Rename player failure',
  props<{ error: unknown }>(),
);
export const deletePlayerSuccess = createAction(
  '[Players/API] Delete player success',
  props<{ playerId: string; name: string }>(),
);
export const deletePlayerFailure = createAction(
  '[Players/API] Delete player failure',
  props<{ name: string; error: unknown }>(),
);
