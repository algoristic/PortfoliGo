import { createEntityAdapter, EntityState } from '@ngrx/entity';
import { Action, createReducer, on } from '@ngrx/store';

import * as UsersActions from './users.actions';

import { User } from '../../domain/models/users.model';

export const USERS_FEATURE_KEY = 'users';

export interface UsersState extends EntityState<User> {
  loaded: boolean;
  selectedId?: string;
}

export const usersAdapter = createEntityAdapter<User>({ selectId: (user) => user.id });

const initialState: UsersState = usersAdapter.getInitialState({
  loaded: false,
});

const reducer = createReducer(
  initialState,
  on(UsersActions.initUsersState, (state) => ({ ...state, loaded: false, selectedId: undefined })),
  on(UsersActions.loadedUsers, (state, { users }) =>
    usersAdapter.setAll(users, { ...state, loaded: true }),
  ),
  on(UsersActions.loadedActiveUserId, (state, { activeUserId }) => ({
    ...state,
    selectedId: activeUserId,
  })),
);

export function usersReducer(state: UsersState | undefined, action: Action): UsersState {
  return reducer(state, action);
}
