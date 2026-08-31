import { createFeatureSelector, createSelector } from '@ngrx/store';
import { USERS_FEATURE_KEY, usersAdapter, UsersState } from './users.reducer';

const selectState = createFeatureSelector<UsersState>(USERS_FEATURE_KEY);
const selectSelectedId = createSelector(selectState, (state) => state.selectedId);
const { selectAll } = usersAdapter.getSelectors();

export const selectUsers = createSelector(selectState, (state) => selectAll(state));
export const selectLoaded = createSelector(selectState, (state) => state.loaded);
export const selectActiveUser = createSelector(selectUsers, selectSelectedId, (users, selectedId) =>
  users.find((user) => user.id === selectedId),
);
