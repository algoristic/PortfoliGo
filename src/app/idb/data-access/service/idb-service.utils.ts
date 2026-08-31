import { openDB } from 'idb';
import { from } from 'rxjs';

import { IndexedDbConfig } from './idb.config';

export function getDatabase(config: IndexedDbConfig) {
  return from(
    openDB(config.databaseName, config.databaseVersion, {
      upgrade(database) {
        for (const storage of config.databaseStorages) {
          if (database.objectStoreNames.contains(storage.name)) {
            continue;
          }
          const store = database.createObjectStore(storage.name);
          if (storage.indexes && storage.indexes.length > 0) {
            for (const index of storage.indexes) {
              if (typeof index === 'string') {
                store.createIndex(index, index);
              } else {
                const { keyPath, options } = index;
                store.createIndex(keyPath, keyPath, options);
              }
            }
          }
        }
      },
    }),
  );
}
