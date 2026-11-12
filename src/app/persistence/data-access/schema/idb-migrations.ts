import { IDBPDatabase } from 'idb';

import { StoreName, STORES } from './idb-schema';

export interface Migration {
  version: number;
  migrate: (database: IDBPDatabase) => void;
}

/** Stores of DB version 3. Frozen: a later change to one of them needs its own migration step. */
const VERSION_3_STORES: readonly StoreName[] = [
  'players',
  'runtime',
  'snapshots',
  'commands',
  'transactions',
  'orders',
  'notifications',
  'candles',
  'series',
  'meta',
];

function createStore(database: IDBPDatabase, name: StoreName): void {
  const { keyPath, indexes = [] } = STORES[name];
  const store = database.createObjectStore(name, { keyPath });
  for (const index of indexes) {
    store.createIndex(index.name, index.keyPath, index.options);
  }
}

/** Numbered upgrade steps (TS §9.7), applied in order for every version above the stored one. */
export const MIGRATIONS: Migration[] = [
  {
    // Drops the stores of the Ionic prototype (version 2) and creates the schema of version 3.
    version: 3,
    migrate: (database) => {
      for (const name of Array.from(database.objectStoreNames)) {
        database.deleteObjectStore(name);
      }
      for (const name of VERSION_3_STORES) {
        createStore(database, name);
      }
    },
  },
  {
    // Market states at month starts per player (E-08, TS §6.8); the stores of version 3 stay.
    version: 4,
    migrate: (database) => createStore(database, 'marketStates'),
  },
];
