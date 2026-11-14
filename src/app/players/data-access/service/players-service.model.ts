import { Tick } from '@app/clock/domain/models/time.model';
import { PlayerProfile } from '@app/players/domain/models/player.model';

export const PLAYER_CHANGES = ['created', 'renamed', 'deleted'] as const;
export type PlayerChange = (typeof PLAYER_CHANGES)[number];

/** Message on the app's channel when a tab changed the player list (TS §9.4). */
export interface PlayersChangedMessage {
  type: 'players-changed';
  change: PlayerChange;
  playerId: string;
}

export interface CreatedPlayer {
  profile: PlayerProfile;
  /** No other player existed: time to ask for persistent storage (TS §9.5). */
  firstPlayer: boolean;
}

export interface ImportedPlayerResult extends CreatedPlayer {
  /** Export tick at which the imported game continues, paused (TS §10.3). */
  tick: Tick;
  /**
   * The recomputed market history reached the exported market state; if not, the game continues from
   * the exported market and the UI tells the user (TS §10.3 step 5).
   */
  marketChecksumMatches: boolean;
}

export const PLAYERS_SERVICE_ERROR_CODES = [
  'player-locked',
  'player-not-found',
  'invalid-input',
] as const;
export type PlayersServiceErrorCode = (typeof PLAYERS_SERVICE_ERROR_CODES)[number];

/** Expected failures of the service; effects map the code to a text. */
export class PlayersServiceError extends Error {
  readonly code: PlayersServiceErrorCode;

  constructor(code: PlayersServiceErrorCode, playerId: string) {
    super(`${code}: ${playerId}`);
    this.name = 'PlayersServiceError';
    this.code = code;
  }
}
