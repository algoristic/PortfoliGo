import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

import { WORKER_STORES } from './idb-schema';
import { openPortfoligoDb } from './open-database';
import { deletePlayerRecords } from './player-records';

describe('deletePlayerRecords', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it('deletes the profile with the worker records when the UI passes players', async () => {
    const database = await openPortfoligoDb();
    for (const id of ['p1', 'p10']) {
      await database.put('players', { id, name: id });
      await database.put('runtime', { playerId: id, tick: 0 });
      await database.put('marketStates', { playerId: id, day: 0 });
      await database.put('candles', {
        playerId: id,
        instrumentId: 'A',
        resolution: '1d',
        bucket: 2030,
      });
    }
    await database.put('meta', { key: 'appVersion' });

    await deletePlayerRecords(database, 'p1', [...WORKER_STORES, 'players']);

    expect(await database.getAllKeys('players')).toEqual(['p10']);
    expect(await database.getAllKeys('runtime')).toEqual(['p10']);
    expect(await database.getAllKeys('marketStates')).toEqual([['p10', 0]]);
    expect(await database.count('candles')).toBe(1);
    expect(await database.count('meta')).toBe(1);
    database.close();
  });
});
