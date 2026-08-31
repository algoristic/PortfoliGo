import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { filter, map, switchMap } from 'rxjs';

import * as UsersActions from './users.actions';

import { UsersService } from '../../data-access/service/users.service';

@Injectable()
export class UsersEffects {
  private readonly actions$ = inject(Actions);
  private readonly usersService = inject(UsersService);

  loadUsers$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UsersActions.initUsersState),
      switchMap(() =>
        this.usersService.getUsers().pipe(map((users) => UsersActions.loadedUsers({ users }))),
      ),
    ),
  );

  loadActiveUserId$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UsersActions.initUsersState),
      switchMap(() =>
        this.usersService
          .getActiveUserId()
          .pipe(map((activeUserId) => UsersActions.loadedActiveUserId({ activeUserId }))),
      ),
    ),
  );
}
