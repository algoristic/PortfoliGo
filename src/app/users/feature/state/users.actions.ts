import { createAction, props } from '@ngrx/store';
import { User } from '../../domain/models/users.model';

export const initUsersState = createAction('[Users] Init users state');
export const loadedUsers = createAction('[Users] Loaded users', props<{ users: User[] }>());
export const loadedActiveUserId = createAction(
  '[Users] Loaded active user ID',
  props<{ activeUserId: string | undefined }>(),
);
