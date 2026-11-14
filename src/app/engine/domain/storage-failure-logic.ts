/**
 * Answer of the worker host to a failed write (TS §9.2, §9.5):
 * - `retry-later`: the game goes on in memory, the next periodic write tries again (`warning`
 *   `storage-failed`);
 * - `drop-candles`: the storage is full; the daily candles of the player are deleted (they are
 *   reproducible, E-08) and the write is tried once more;
 * - `storage-full`: still full without candles; the game pauses (`warning` `storage-full`).
 */
export type StorageFailureResponse = 'retry-later' | 'drop-candles' | 'storage-full';

/** TS §9.5: only a full storage drops the candles, and only once per loaded player. */
export function storageFailureResponse(
  quotaExceeded: boolean,
  candlesDropped: boolean,
): StorageFailureResponse {
  if (!quotaExceeded) {
    return 'retry-later';
  }
  return candlesDropped ? 'storage-full' : 'drop-candles';
}
