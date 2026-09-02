import { createEntityAdapter, EntityState } from '@ngrx/entity';
import { Action, createReducer, on } from '@ngrx/store';

import * as UsersActions from './users.actions';

import { User } from '../../domain/models/users.model';

export const USERS_FEATURE_KEY = 'users' as const;

export interface UsersState extends EntityState<User> {
  loadedUsers: boolean;
  loadedActiveUser: boolean;
  creatingUser?: boolean;
  selectedId?: string;
}

export const usersAdapter = createEntityAdapter<User>({ selectId: (user) => user.id });

const initialState: UsersState = usersAdapter.getInitialState({
  loadedUsers: false,
  loadedActiveUser: false,
});

const reducer = createReducer(
  initialState,
  on(UsersActions.initUsersState, (state) => ({
    ...state,
    loadedUsers: false,
    loadedActiveUser: false,
    selectedId: undefined,
  })),
  on(UsersActions.loadedUsers, (state, { users }) =>
    usersAdapter.setAll(users, {
      ...state,
      loadedUsers: true,
    }),
  ),
  on(UsersActions.loadedActiveUserId, (state, { activeUserId }) => ({
    ...state,
    loadedActiveUser: true,
    selectedId: activeUserId,
  })),
  on(UsersActions.submittedUser, (state) => ({
    ...state,
    creatingUser: true,
  })),
  on(UsersActions.createdUser, (state, { user }) =>
    usersAdapter.addOne(user, {
      ...state,
      creatingUser: false,
    }),
  ),
  on(UsersActions.setNewUserActive, (state, { activeUserId }) => ({
    ...state,
    selectedId: activeUserId,
  })),
  on(UsersActions.selectedActiveUser, (state, { user }) => ({
    ...state,
    selectedId: user.id,
  })),
  on(UsersActions.deletedUser, (state, { user }) => usersAdapter.removeOne(user.id, state)),
);

export function usersReducer(state: UsersState | undefined, action: Action): UsersState {
  return reducer(state, action);
}
