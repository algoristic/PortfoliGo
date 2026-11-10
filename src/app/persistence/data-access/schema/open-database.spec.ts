import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';

import { DB_NAME, DB_VERSION, STORE_NAMES, TRANSACTIONS_BY_ACCOUNT_INDEX } from './idb-schema';
import { openPortfoligoDb } from './open-database';

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

  it('drops the stores of the prototype when upgrading from version 2', async () => {
    const prototype = await openDB(DB_NAME, 2, {
      upgrade(database) {
        database.createObjectStore('players');
        database.createObjectStore('profiles');
      },
    });
    await prototype.put('profiles', { name: 'alt' }, 'p1');
    prototype.close();

    const database = await openPortfoligoDb();

    expect(database.objectStoreNames.contains('profiles')).toBe(false);
    expect(database.transaction('players').objectStore('players').keyPath).toBe('id');
    database.close();
  });
});
