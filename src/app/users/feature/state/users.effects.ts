import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { LoadingController } from '@ionic/angular';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { from, map, switchMap, tap } from 'rxjs';

import * as UsersActions from './users.actions';

import * as TransactionsActions from '../../../transactions/feature/state/transactions.actions';
import { UsersService } from '../../data-access/service/users.service';

@Injectable()
export class UsersEffects {
  private readonly actions$ = inject(Actions);
  private readonly router = inject(Router);
  private readonly usersService = inject(UsersService);
  private readonly loadingController = inject(LoadingController);

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

  createUser$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UsersActions.submittedUser),
      switchMap(({ properties }) =>
        this.usersService
          .createUser(properties.name, properties.monthlySavingsAmount)
          .pipe(map((user) => UsersActions.createdUser({ user }))),
      ),
    ),
  );

  depositInitialCapital$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UsersActions.submittedUser),
      switchMap(({ properties }) =>
        this.actions$.pipe(
          ofType(UsersActions.createdUser),
          map(({ user }) =>
            TransactionsActions.depositInitialCapital({ user, amount: properties.startingCapital }),
          ),
        ),
      ),
    ),
  );

  setNewUserActive$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UsersActions.createdUser),
      switchMap(({ user }) =>
        this.usersService
          .setActiveUserId(user.id)
          .pipe(map((activeUserId) => UsersActions.setNewUserActive({ activeUserId }))),
      ),
    ),
  );

  requestDeleteUser$ = createEffect(() =>
    this.actions$.pipe(
      ofType(UsersActions.requestDeleteUser),
      switchMap(({ user }) =>
        this.usersService.deleteUser(user).pipe(map(() => UsersActions.deletedUser({ user }))),
      ),
    ),
  );

  redirectNewUser$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(UsersActions.setNewUserActive),
        tap(() => this.router.navigate(['home'])),
      ),
    { dispatch: false },
  );

  blockScreenWhileCreatingUser$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(UsersActions.submittedUser),
        switchMap(() =>
          from(
            this.loadingController.create({
              message: 'Profil wird angelegt',
              duration: 2000,
            }),
          ),
        ),
        tap((loadingElement) => loadingElement.present()),
      ),
    { dispatch: false },
  );

  selectActiveUser$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(UsersActions.selectedActiveUser),
        tap(() => this.router.navigate(['home'])),
      ),
    { dispatch: false },
  );
}
