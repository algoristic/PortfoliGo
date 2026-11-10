import { IDBPDatabase } from 'idb';

import { STORE_NAMES, STORES } from './idb-schema';

export interface Migration {
  version: number;
  migrate: (database: IDBPDatabase) => void;
}

/** Numbered upgrade steps (TS §9.7), applied in order for every version above the stored one. */
export const MIGRATIONS: Migration[] = [
  {
    // Drops the stores of the Ionic prototype (version 2) and creates the schema. Until real game
    // states exist, the stores may still be changed in this step instead of adding a new one.
    version: 3,
    migrate: (database) => {
      for (const name of Array.from(database.objectStoreNames)) {
        database.deleteObjectStore(name);
      }
      for (const name of STORE_NAMES) {
        const { keyPath, indexes = [] } = STORES[name];
        const store = database.createObjectStore(name, { keyPath });
        for (const index of indexes) {
          store.createIndex(index.name, index.keyPath, index.options);
        }
      }
    },
  },
];
