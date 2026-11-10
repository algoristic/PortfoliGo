import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { IDBFactory } from 'fake-indexeddb';
import { firstValueFrom } from 'rxjs';

import { IndexedDbService } from './indexed-db.service';

import { TRANSACTIONS_BY_ACCOUNT_INDEX } from '../schema/idb-schema';

interface TestTransaction {
  playerId: string;
  seq: number;
  accountIds: string[];
}

describe('IndexedDbService', () => {
  let service: IndexedDbService;
  const booking: TestTransaction = { playerId: 'p1', seq: 1, accountIds: ['a1', 'a2'] };

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    TestBed.configureTestingModule({ providers: [IndexedDbService] });
    service = TestBed.inject(IndexedDbService);
  });

  describe('put and get', () => {
    it('stores a record under its in-line key', async () => {
      await firstValueFrom(service.put('transactions', booking));

      expect(await firstValueFrom(service.get('transactions', ['p1', 1]))).toEqual(booking);
    });

    it('returns undefined when the key does not exist', async () => {
      expect(await firstValueFrom(service.get('players', 'missing'))).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('returns all records of a store', async () => {
      await firstValueFrom(service.put('players', { id: 'p1' }));
      await firstValueFrom(service.put('players', { id: 'p2' }));

      expect(await firstValueFrom(service.getAll('players'))).toEqual([{ id: 'p1' }, { id: 'p2' }]);
    });
  });

  describe('getAllFromIndex', () => {
    it('finds records by each entry of a multi-entry index', async () => {
      await firstValueFrom(service.put('transactions', booking));
      await firstValueFrom(
        service.put('transactions', { playerId: 'p1', seq: 2, accountIds: ['a3'] }),
      );

      const result = await firstValueFrom(
        service.getAllFromIndex('transactions', TRANSACTIONS_BY_ACCOUNT_INDEX, 'a2'),
      );

      expect(result).toEqual([booking]);
    });
  });

  describe('delete', () => {
    it('removes a record', async () => {
      await firstValueFrom(service.put('players', { id: 'p1' }));
      await firstValueFrom(service.delete('players', 'p1'));

      expect(await firstValueFrom(service.get('players', 'p1'))).toBeUndefined();
    });
  });
});
