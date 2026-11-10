import { DOCUMENT, inject, Injectable } from '@angular/core';
import { defer, Observable, of } from 'rxjs';

import { LocalStorageKey, VersionedEntry } from './local-storage-service.model';
import { isVersionedEntry } from './local-storage-service.utils';

/** Typed, versioned JSON in localStorage. Entries with another version are treated as missing. */
@Injectable()
export class LocalStorageService {
  readonly #storage = inject(DOCUMENT).defaultView?.localStorage;

  get<T>(key: LocalStorageKey, version: number): Observable<T | undefined> {
    return defer(() => of(this.#read<T>(key, version)));
  }

  set<T>(key: LocalStorageKey, version: number, data: T): Observable<T> {
    return defer(() => {
      const entry: VersionedEntry<T> = { v: version, data };
      this.#storage?.setItem(key, JSON.stringify(entry));
      return of(data);
    });
  }

  remove(key: LocalStorageKey): Observable<void> {
    return defer(() => {
      this.#storage?.removeItem(key);
      return of(undefined);
    });
  }

  #read<T>(key: LocalStorageKey, version: number): T | undefined {
    const raw = this.#storage?.getItem(key);
    if (raw === null || raw === undefined) {
      return undefined;
    }
    let entry: unknown;
    try {
      entry = JSON.parse(raw);
    } catch {
      return undefined;
    }
    return isVersionedEntry(entry) && entry.v === version ? (entry.data as T) : undefined;
  }
}
