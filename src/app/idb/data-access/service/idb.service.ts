import { inject, Injectable } from '@angular/core';

import { from, map, Observable, switchMap } from 'rxjs';

import { getDatabase } from './idb-service.utils';
import { INDEXED_DB_CONFIG } from './idb.config';

@Injectable()
export class IndexedDbService {
  #database$ = getDatabase(inject(INDEXED_DB_CONFIG));

  getAll<T>(storageName: string): Observable<T[]> {
    return this.#database$.pipe(switchMap((database) => from(database.getAll(storageName))));
  }

  getMany<T>(storage: string, indexName: string, indexValue: string): Observable<T[]> {
    return this.#database$.pipe(
      switchMap((database) => from(database.getAllFromIndex(storage, indexName, indexValue))),
    );
  }

  getOne<T>(storageName: string, key: string): Observable<T | undefined> {
    return this.#database$.pipe(switchMap((database) => from(database.get(storageName, key))));
  }

  add<T>(storageName: string, key: string, item: T): Observable<T> {
    return this.#database$.pipe(
      switchMap((database) => from(database.put(storageName, item, key))),
      map(() => item),
    );
  }

  remove<T>(storageName: string, key: string): Observable<T | undefined> {
    return this.#database$.pipe(
      switchMap((database) =>
        from(database.get(storageName, key)).pipe(
          switchMap((item) => from(database.delete(storageName, key)).pipe(map(() => item))),
        ),
      ),
    );
  }
}
