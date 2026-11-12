import {
  PLAYER_CHANGES,
  PlayersChangedMessage,
  PlayersServiceError,
  PlayersServiceErrorCode,
} from './players-service.model';

/** Messages of other tabs arrive untyped; other message types may share the channel. */
export function isPlayersChangedMessage(value: unknown): value is PlayersChangedMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const message = value as Record<string, unknown>;
  return (
    message['type'] === 'players-changed' &&
    (PLAYER_CHANGES as readonly unknown[]).includes(message['change']) &&
    typeof message['playerId'] === 'string' &&
    message['playerId'] !== ''
  );
}

/** Whether `error` is an expected failure of the service, optionally with the given code. */
export function isPlayersServiceError(
  error: unknown,
  code?: PlayersServiceErrorCode,
): error is PlayersServiceError {
  return error instanceof PlayersServiceError && (code === undefined || error.code === code);
}

/** A new player ID from four random 32-bit words: `p-` and 32 hexadecimal digits. */
export function createPlayerId(randomUint32: () => number): string {
  let hex = '';
  for (let i = 0; i < 4; i++) {
    hex += (randomUint32() >>> 0).toString(16).padStart(8, '0');
  }
  return `p-${hex}`;
}
