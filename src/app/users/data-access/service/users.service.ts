import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { v4 as createId } from 'uuid';

import { activeUserIdKey, usersStorage } from './users-service.providers';

import { IndexedDbService } from '../../../idb/data-access/service/idb.service';
import { LocalStorageService } from '../../../local-storage/data-access/service/local-storage.service';
import { User } from '../../domain/models/users.model';

@Injectable()
export class UsersService {
  readonly #idbService = inject(IndexedDbService);
  readonly #localStorageService = inject(LocalStorageService);

  getUsers(): Observable<User[]> {
    return this.#idbService.getAll(usersStorage.name);
  }

  getActiveUserId(): Observable<string | undefined> {
    return this.#localStorageService.getFromStorage(activeUserIdKey);
  }

  setActiveUserId(id: string): Observable<string> {
    return this.#localStorageService.addToStorage(activeUserIdKey, id);
  }

  createUser(name: string, monthlySavingsAmount: number): Observable<User> {
    const id = createId();
    const newUser: User = {
      id,
      name,
      monthlySavingsAmount,
      createdAt: new Date().toISOString(),
    };

    return this.#idbService.add(usersStorage.name, id, newUser);
  }

  deleteUser(user: User): Observable<User | undefined> {
    return this.#idbService.remove(usersStorage.name, user.id);
  }
}
