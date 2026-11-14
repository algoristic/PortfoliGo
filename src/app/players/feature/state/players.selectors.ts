import { createFeatureSelector, createSelector } from '@ngrx/store';

import { PLAYERS_FEATURE_KEY, PlayersState } from './players.reducer';

const selectState = createFeatureSelector<PlayersState>(PLAYERS_FEATURE_KEY);

export const selectPlayers = createSelector(selectState, (state) => state.players);
export const selectLoaded = createSelector(selectState, (state) => state.loaded);
export const selectLastPlayerId = createSelector(selectState, (state) => state.lastPlayerId);
export const selectSuggestedSeed = createSelector(selectState, (state) => state.suggestedSeed);
export const selectCreating = createSelector(selectState, (state) => state.creating);
export const selectImporting = createSelector(selectState, (state) => state.importing);
export const selectExporting = createSelector(selectState, (state) => state.exporting);
export const selectBackup = createSelector(selectState, (state) => state.backup);

/** Share of the import's history run, `null` while the total is not known. */
export const selectImportRatio = createSelector(selectState, ({ importProgress }) =>
  importProgress === null || importProgress.total <= 0
    ? null
    : Math.min(1, Math.max(0, importProgress.done / importProgress.total)),
);
