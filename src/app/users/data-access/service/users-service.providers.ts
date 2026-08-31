import { EnvironmentProviders, Provider } from '@angular/core';

import { UsersService } from './users.service';

import { IdbStorage } from '../../../idb/data-access/service/idb.config';
import { provideLocalStorageService } from '../../../local-storage/data-access/service/local-storage-service.providers';

export function provideUsersService(): Array<Provider | EnvironmentProviders> {
  return [UsersService, provideLocalStorageService()];
}

export const usersStorage: IdbStorage = { name: 'users' };
export const activeUserIdKey = 'portfoligo:users:activeUserId';
