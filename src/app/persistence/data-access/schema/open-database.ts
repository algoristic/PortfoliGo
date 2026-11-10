import { IDBPDatabase, openDB } from 'idb';

import { MIGRATIONS } from './idb-migrations';
import { DB_NAME, DB_VERSION } from './idb-schema';

/** Opens the PortfoliGo database and runs pending migrations. Framework-free (UI and worker). */
export function openPortfoligoDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion) {
      for (const migration of MIGRATIONS) {
        if (migration.version > oldVersion && migration.version <= DB_VERSION) {
          migration.migrate(database);
        }
      }
    },
  });
}
