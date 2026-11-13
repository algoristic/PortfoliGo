import { createFeatureSelector, createSelector } from '@ngrx/store';

import { SETTINGS_FEATURE_KEY, SettingsState } from './settings.reducer';

const selectState = createFeatureSelector<SettingsState>(SETTINGS_FEATURE_KEY);

export const selectSettings = createSelector(selectState, (state) => state.settings);
export const selectColorScheme = createSelector(
  selectSettings,
  (settings) => settings.appearance.colorScheme,
);
export const selectShortcutsEnabled = createSelector(
  selectSettings,
  (settings) => settings.shortcuts.enabled,
);
