import { IDBPDatabase } from 'idb';

import { StoreName, STORES, WORKER_STORES } from './idb-schema';

/**
 * Key range of all records of a player in a store keyed by `[playerId, …]`: `[playerId]` sorts
 * before every longer key with that prefix, and an array sorts after every number and string.
 */
export function playerKeyRange(playerId: string): IDBKeyRange {
  return IDBKeyRange.bound([playerId], [playerId, []]);
}

/** The player's records in one store: its key for stores keyed by the player, else the range. */
export function playerRecordsQuery(store: StoreName, playerId: string): IDBValidKey | IDBKeyRange {
  return Array.isArray(STORES[store].keyPath) ? playerKeyRange(playerId) : playerId;
}

/**
 * Deletes all records of a player in one transaction (framework-free: worker and UI). By default the
 * stores of the worker; the UI adds `players` when it deletes the profile with them (AP 2.4).
 */
export async function deletePlayerRecords(
  database: IDBPDatabase,
  playerId: string,
  stores: readonly StoreName[] = WORKER_STORES,
): Promise<void> {
  const transaction = database.transaction([...stores], 'readwrite');
  await Promise.all([
    ...stores.map((store) =>
      transaction.objectStore(store).delete(playerRecordsQuery(store, playerId)),
    ),
    transaction.done,
  ]);
}
