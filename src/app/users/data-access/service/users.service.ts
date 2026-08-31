import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { activeUserIdKey, usersStorage } from './users-service.providers';

import { IndexedDbService } from '../../../idb/data-access/service/idb.service';
import { User } from '../../domain/models/users.model';
import { LocalStorageService } from '../../../local-storage/data-access/service/local-storage.service';

@Injectable()
export class UsersService {
  private readonly idbService = inject(IndexedDbService);
  private readonly localStorageService = inject(LocalStorageService);

  getUsers(): Observable<User[]> {
    return this.idbService.getAll(usersStorage.name);
  }

  getActiveUserId(): Observable<string | undefined> {
    return this.localStorageService.getFromStorage(activeUserIdKey);
  }
}
