import { createAction, props } from '@ngrx/store';

import { PlayerProfile } from '@app/players/domain/models/player.model';

import { GameRejection } from './session.model';

import {
  LoadedPlayer,
  ProgressPayload,
  WarningPayload,
} from '../../data-access/service/engine-service.model';
import { EngineFatal } from '../../data-access/service/engine.service';

export const enterGame = createAction(
  '[Session/Page] Enter game',
  props<{ profile: PlayerProfile }>(),
);
export const leaveGame = createAction('[Session/Page] Leave game');
/** „Neu laden“ on the overlay of a failed game (TS §8.5). */
export const clickedReload = createAction('[Session/Page] Clicked reload');
/** The guard sends the player back to the selection (TS §11.4). */
export const rejectedGame = createAction(
  '[Session/Page] Rejected game',
  props<{ playerId: string; reason: GameRejection }>(),
);

export const loadPlayerSuccess = createAction(
  '[Session/API] Load player success',
  props<{ loaded: LoadedPlayer }>(),
);
export const loadPlayerFailure = createAction(
  '[Session/API] Load player failure',
  props<{ error: unknown }>(),
);
export const unloadPlayerSuccess = createAction('[Session/API] Unload player success');
export const unloadPlayerFailure = createAction(
  '[Session/API] Unload player failure',
  props<{ error: unknown }>(),
);
export const retrievedProgress = createAction(
  '[Session/API] Retrieved progress',
  props<{ progress: ProgressPayload }>(),
);
export const receivedWarning = createAction(
  '[Session/API] Received warning',
  props<{ warning: WarningPayload }>(),
);
export const receivedFatal = createAction(
  '[Session/API] Received fatal',
  props<{ fatal: EngineFatal }>(),
);
