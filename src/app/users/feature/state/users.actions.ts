import { createAction, props } from '@ngrx/store';

import { CreateUserProperties } from './users.model';

import { User } from '../../domain/models/users.model';

export const initUsersState = createAction('[Users] Init users state');
export const loadedUsers = createAction('[Users] Loaded users', props<{ users: User[] }>());
export const loadedActiveUserId = createAction(
  '[Users] Loaded active user ID',
  props<{ activeUserId: string | undefined }>(),
);
export const submittedUser = createAction(
  '[Users] Submitted new user',
  props<{ properties: CreateUserProperties }>(),
);
export const createdUser = createAction('[Users] Created new user', props<{ user: User }>());
export const setNewUserActive = createAction(
  '[Users] Set new user active',
  props<{ activeUserId: string }>(),
);
export const selectedActiveUser = createAction(
  '[Users] Selected active user',
  props<{ user: User }>(),
);
export const requestDeleteUser = createAction(
  '[Users] Request user deletion',
  props<{ user: User }>(),
);
export const deletedUser = createAction('[Users] Deleted user', props<{ user: User }>());
