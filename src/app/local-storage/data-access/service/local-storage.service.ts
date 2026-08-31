import { Injectable } from '@angular/core';
import { Observable, of, tap } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LocalStorageService {
  getFromStorage<T>(key: string): Observable<T | undefined> {
    const storedItem = localStorage.getItem(key);
    if (!storedItem) {
      return of(undefined);
    }
    const parsedItem = JSON.parse(storedItem);
    return of(parsedItem);
  }

  addToStorage<T>(key: string, item: T): Observable<T> {
    const storeData = JSON.stringify(item);
    localStorage.setItem(key, storeData);
    return of(item);
  }

  deleteFromStorage<T>(key: string): Observable<T | undefined> {
    return this.getFromStorage<T>(key).pipe(tap(() => localStorage.removeItem(key)));
  }
}
