import { EnvironmentProviders, inject, provideAppInitializer, Provider } from '@angular/core';
import { provideState } from '@ngrx/store';

import { UsersFacade } from './users.facade';
import * as fromUsers from './users.reducer';

import { provideUsersService } from '../../data-access/service/users-service.providers';
import { provideEffects } from '@ngrx/effects';
import { UsersEffects } from './users.effects';

export function provideUsersState(): Array<Provider | EnvironmentProviders> {
  return [
    UsersFacade,
    provideState(fromUsers.USERS_FEATURE_KEY, fromUsers.usersReducer),
    provideEffects(UsersEffects),
    provideUsersService(),
    provideAppInitializer(() => inject(UsersFacade).init()),
  ];
}
