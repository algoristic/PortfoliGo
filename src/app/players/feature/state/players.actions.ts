import { createAction, props } from '@ngrx/store';

import { BackupIntervalDays, PlayerBackupStatus } from '@app/players/domain/models/backup.model';
import { NewPlayer, PlayerListEntry, PlayerProfile } from '@app/players/domain/models/player.model';

import { PlayersChangedMessage } from '../../data-access/service/players-service.model';
import { ExportSaveTarget } from '../dialog-export-player/dialog-export-player.model';

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

export const clickedImportPlayer = createAction('[Players/Page] Clicked import player');
/** The import dialog was submitted; the content stays out of the store (it can be megabytes). */
export const submittedImportPlayer = createAction('[Players/Page] Submitted import player');
export const clickedExportPlayer = createAction('[Players/Page] Clicked export player');
export const savedPlayerExport = createAction(
  '[Players/Page] Saved player export',
  props<{ playerId: string; target: ExportSaveTarget }>(),
);
export const selectedBackupInterval = createAction(
  '[Players/Page] Selected backup interval',
  props<{ intervalDays: BackupIntervalDays | null }>(),
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
export const retrievedImportProgress = createAction(
  '[Players/API] Retrieved import progress',
  props<{ done: number; total: number }>(),
);
export const importPlayerSuccess = createAction(
  '[Players/API] Import player success',
  props<{ profile: PlayerProfile; firstPlayer: boolean; marketChecksumMatches: boolean }>(),
);
export const importPlayerFailure = createAction(
  '[Players/API] Import player failure',
  props<{ error: unknown }>(),
);
/** The worker built the export; the dialog that saves it is open. */
export const exportPlayerSuccess = createAction(
  '[Players/API] Export player success',
  props<{ playerId: string; fileName: string }>(),
);
export const exportPlayerFailure = createAction(
  '[Players/API] Export player failure',
  props<{ error: unknown }>(),
);
export const loadedBackup = createAction(
  '[Players/API] Loaded backup',
  props<{ backup: PlayerBackupStatus }>(),
);
export const recordedExport = createAction(
  '[Players/API] Recorded export',
  props<{ playerId: string; exportedAt: number }>(),
);
export const saveBackupFailure = createAction(
  '[Players/API] Save backup failure',
  props<{ error: unknown }>(),
);
