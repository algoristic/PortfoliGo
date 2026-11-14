import { Settings } from '@app/settings/domain/models/settings.model';

import * as SettingsActions from './settings.actions';
import { initialSettingsState, settingsReducer, SettingsState } from './settings.reducer';

const LOADED_SETTINGS: Settings = {
  appearance: { colorScheme: 'system', changeColors: 'blue-orange' },
  motion: { priceHighlight: false },
  shortcuts: { enabled: false },
  notifications: { toast: { 'order-executed': false }, browser: {} },
};

const LOADED: SettingsState = { ...initialSettingsState, loaded: true, settings: LOADED_SETTINGS };

describe('settingsReducer', () => {
  it('changes only the selected colour scheme and keeps the other sections', () => {
    const state = settingsReducer(
      LOADED,
      SettingsActions.selectedColorScheme({ colorScheme: 'light' }),
    );
    expect(state.settings).toEqual<Settings>({
      ...LOADED_SETTINGS,
      appearance: { colorScheme: 'light', changeColors: 'blue-orange' },
    });
  });

  it('changes only the gain and loss colours and keeps the other sections', () => {
    const state = settingsReducer(
      LOADED,
      SettingsActions.selectedChangeColors({ changeColors: 'green-red' }),
    );
    expect(state.settings).toEqual<Settings>({
      ...LOADED_SETTINGS,
      appearance: { colorScheme: 'system', changeColors: 'green-red' },
    });
  });

  it('stores a toast switch as a deviation and drops it again at the default', () => {
    // TS §12: `dividend-received` has no toast by default, `order-executed` has one.
    const on = settingsReducer(
      LOADED,
      SettingsActions.toggledNotificationChannel({
        channel: 'toast',
        code: 'dividend-received',
        enabled: true,
      }),
    );
    expect(on.settings.notifications).toEqual({
      toast: { 'order-executed': false, 'dividend-received': true },
      browser: {},
    });

    const back = settingsReducer(
      on,
      SettingsActions.toggledNotificationChannel({
        channel: 'toast',
        code: 'order-executed',
        enabled: true,
      }),
    );
    expect(back.settings).toEqual<Settings>({
      ...LOADED_SETTINGS,
      notifications: { toast: { 'dividend-received': true }, browser: {} },
    });
  });

  it('keeps the defaults when loading fails', () => {
    const error = new Error('SecurityError');
    const state = settingsReducer(undefined, SettingsActions.loadSettingsFailure({ error }));
    expect(state.loaded).toBe(true);
    // TS §9.3: dark (E-06), green and red, highlight and shortcuts on, TS §12 for notifications.
    expect(state.settings).toEqual<Settings>({
      appearance: { colorScheme: 'dark', changeColors: 'green-red' },
      motion: { priceHighlight: true },
      shortcuts: { enabled: true },
      notifications: { toast: {}, browser: {} },
    });
  });
});
