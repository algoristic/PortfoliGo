import { createFeatureSelector, createSelector } from '@ngrx/store';

import { PLAYERS_FEATURE_KEY, PlayersState } from './players.reducer';

const selectState = createFeatureSelector<PlayersState>(PLAYERS_FEATURE_KEY);

export const selectPlayers = createSelector(selectState, (state) => state.players);
export const selectLoaded = createSelector(selectState, (state) => state.loaded);
export const selectLastPlayerId = createSelector(selectState, (state) => state.lastPlayerId);
export const selectSuggestedSeed = createSelector(selectState, (state) => state.suggestedSeed);
export const selectCreating = createSelector(selectState, (state) => state.creating);
