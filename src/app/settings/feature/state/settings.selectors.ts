import { createFeatureSelector, createSelector } from '@ngrx/store';

import { effectiveNotificationChannels } from '@app/notifications/domain/notification-channel-logic';

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
export const selectChangeColors = createSelector(
  selectSettings,
  (settings) => settings.appearance.changeColors,
);
export const selectPriceHighlight = createSelector(
  selectSettings,
  (settings) => settings.motion.priceHighlight,
);
export const selectNotificationChannels = createSelector(
  selectSettings,
  (settings) => settings.notifications,
);

/** The effective toast and browser setting of every code (TS §12), for the settings page. */
export const selectEffectiveNotificationChannels = createSelector(
  selectNotificationChannels,
  (channels) => effectiveNotificationChannels(channels),
);
