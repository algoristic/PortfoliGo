import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';

import dbV2 from './db-v2.json';
import {
  DB_NAME,
  DB_VERSION,
  STORE_NAMES,
  STORES,
  TRANSACTIONS_BY_ACCOUNT_INDEX,
} from './idb-schema';
import { openPortfoligoDb } from './open-database';

/** Frozen database of an older DB version, as `db-v<version>.json` next to this spec (TS §9.7). */
interface DatabaseFixture {
  version: number;
  stores: { name: string; indexes: string[]; records: { key: string; value: unknown }[] }[];
}

/** Creates the database of a fixture the way the app of that version did. */
async function installFixture(fixture: DatabaseFixture): Promise<void> {
  const database = await openDB(DB_NAME, fixture.version, {
    upgrade(upgrade) {
      for (const store of fixture.stores) {
        const objectStore = upgrade.createObjectStore(store.name);
        for (const index of store.indexes) {
          objectStore.createIndex(index, index);
        }
      }
    },
  });
  for (const store of fixture.stores) {
    for (const record of store.records) {
      await database.put(store.name, record.value, record.key);
    }
  }
  database.close();
}

describe('openPortfoligoDb', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it('creates all stores of the schema in a new database', async () => {
    const database = await openPortfoligoDb();

    expect(database.version).toBe(DB_VERSION);
    expect(Array.from(database.objectStoreNames).sort()).toEqual([...STORE_NAMES].sort());
    database.close();
  });

  it('uses in-line keys and a multi-entry account index for transactions', async () => {
    const database = await openPortfoligoDb();
    const transaction = database.transaction(['snapshots', 'transactions'], 'readonly');

    expect(transaction.objectStore('snapshots').keyPath).toEqual(['playerId', 'tick']);
    const index = transaction.objectStore('transactions').index(TRANSACTIONS_BY_ACCOUNT_INDEX);
    expect(index.keyPath).toBe('accountIds');
    expect(index.multiEntry).toBe(true);
    database.close();
  });

  describe('upgrade from version 2 (db-v2.json)', () => {
    beforeEach(() => installFixture(dbV2));

    it('drops the stores and records of the prototype', async () => {
      const database = await openPortfoligoDb();

      expect(database.version).toBe(DB_VERSION);
      expect(database.objectStoreNames.contains('profiles')).toBe(false);
      expect(await database.count('players')).toBe(0);
      database.close();
    });

    it('creates the schema with its in-line keys', async () => {
      const database = await openPortfoligoDb();

      expect(Array.from(database.objectStoreNames).sort()).toEqual([...STORE_NAMES].sort());
      const transaction = database.transaction([...STORE_NAMES], 'readonly');
      for (const name of STORE_NAMES) {
        expect(transaction.objectStore(name).keyPath, name).toEqual(STORES[name].keyPath);
      }
      expect(transaction.objectStore('players').indexNames.contains('name')).toBe(false);
      database.close();
    });
  });
});
