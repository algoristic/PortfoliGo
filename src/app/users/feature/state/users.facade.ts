import { inject, Injectable } from '@angular/core';
import { select, Store } from '@ngrx/store';

import * as UsersActions from './users.actions';
import { CreateUserProperties } from './users.model';
import * as UsersSelectors from './users.selectors';

import { User } from '../../domain/models/users.model';

@Injectable()
export class UsersFacade {
  readonly #store = inject(Store);

  users$ = this.#store.pipe(select(UsersSelectors.selectUsers));
  activeUser$ = this.#store.pipe(select(UsersSelectors.selectActiveUser));
  loadedUsers$ = this.#store.pipe(select(UsersSelectors.selectLoadedUsers));
  loadedActiveUser$ = this.#store.pipe(select(UsersSelectors.selectLoadedActiveUser));
  creatingUser$ = this.#store.pipe(select(UsersSelectors.selectCreatingUser));

  init(): void {
    this.#store.dispatch(UsersActions.initUsersState());
  }

  submitUser(properties: CreateUserProperties): void {
    this.#store.dispatch(UsersActions.submittedUser({ properties }));
  }

  selectActiveUser(user: User): void {
    this.#store.dispatch(UsersActions.selectedActiveUser({ user }));
  }

  requestDeleteUser(user: User): void {
    this.#store.dispatch(UsersActions.requestDeleteUser({ user }));
  }
}
