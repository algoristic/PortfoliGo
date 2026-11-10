import { Injectable } from '@angular/core';
import { defer, from, map, Observable, shareReplay, switchMap } from 'rxjs';

import { StoreName } from '../schema/idb-schema';
import { openPortfoligoDb } from '../schema/open-database';

@Injectable()
export class IndexedDbService {
  readonly #database$ = defer(() => openPortfoligoDb()).pipe(shareReplay(1));

  getAll<T>(store: StoreName): Observable<T[]> {
    return this.#database$.pipe(switchMap((database) => from(database.getAll(store))));
  }

  getAllFromIndex<T>(
    store: StoreName,
    index: string,
    query: IDBValidKey | IDBKeyRange,
  ): Observable<T[]> {
    return this.#database$.pipe(
      switchMap((database) => from(database.getAllFromIndex(store, index, query))),
    );
  }

  get<T>(store: StoreName, key: IDBValidKey): Observable<T | undefined> {
    return this.#database$.pipe(switchMap((database) => from(database.get(store, key))));
  }

  put<T>(store: StoreName, value: T): Observable<T> {
    return this.#database$.pipe(
      switchMap((database) => from(database.put(store, value))),
      map(() => value),
    );
  }

  delete(store: StoreName, key: IDBValidKey): Observable<void> {
    return this.#database$.pipe(switchMap((database) => from(database.delete(store, key))));
  }
}
