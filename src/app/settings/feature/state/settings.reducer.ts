import { Action, createReducer, on } from '@ngrx/store';

import { DEFAULT_SETTINGS, Settings } from '@app/settings/domain/models/settings.model';

import * as SettingsActions from './settings.actions';

export const SETTINGS_FEATURE_KEY = 'settings';

export interface SettingsState {
  /** Settings of this device; the defaults until loaded and when loading fails. */
  settings: Settings;
  loaded: boolean;
  error?: unknown;
}

export const initialSettingsState: SettingsState = { settings: DEFAULT_SETTINGS, loaded: false };

const reducer = createReducer(
  initialSettingsState,
  on(SettingsActions.loadedSettings, (state, { settings }) => ({
    ...state,
    settings,
    loaded: true,
  })),
  on(SettingsActions.loadSettingsFailure, (state, { error }) => ({
    ...state,
    loaded: true,
    error,
  })),
  on(SettingsActions.selectedColorScheme, (state, { colorScheme }) => ({
    ...state,
    settings: {
      ...state.settings,
      appearance: { ...state.settings.appearance, colorScheme },
    },
  })),
  on(SettingsActions.toggledShortcuts, (state, { enabled }) => ({
    ...state,
    settings: { ...state.settings, shortcuts: { ...state.settings.shortcuts, enabled } },
  })),
  on(SettingsActions.saveSettingsFailure, (state, { error }) => ({ ...state, error })),
);

export function settingsReducer(state: SettingsState | undefined, action: Action): SettingsState {
  return reducer(state, action);
}
