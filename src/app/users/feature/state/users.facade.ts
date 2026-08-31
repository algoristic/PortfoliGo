import { inject, Injectable } from '@angular/core';
import { select, Store } from '@ngrx/store';

import * as UsersActions from './users.actions';
import * as UsersSelectors from './users.selectors';

@Injectable()
export class UsersFacade {
  private readonly store = inject(Store);

  loaded$ = this.store.pipe(select(UsersSelectors.selectLoaded));
  users$ = this.store.pipe(select(UsersSelectors.selectUsers));
  activeUser$ = this.store.pipe(select(UsersSelectors.selectActiveUser));

  init(): void {
    this.store.dispatch(UsersActions.initUsersState());
  }
}
