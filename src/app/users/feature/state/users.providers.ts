import { EnvironmentProviders, inject, provideAppInitializer, Provider } from '@angular/core';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';

import { UsersEffects } from './users.effects';
import { UsersFacade } from './users.facade';
import * as fromUsers from './users.reducer';

import { provideUsersService } from '../../data-access/service/users-service.providers';

export function provideUsersState(): Array<Provider | EnvironmentProviders> {
  return [
    UsersFacade,
    provideState(fromUsers.USERS_FEATURE_KEY, fromUsers.usersReducer),
    provideEffects(UsersEffects),
    provideUsersService(),
    provideAppInitializer(() => inject(UsersFacade).init()),
  ];
}
