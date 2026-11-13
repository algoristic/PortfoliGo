import { Settings } from '@app/settings/domain/models/settings.model';

import * as SettingsActions from './settings.actions';
import { initialSettingsState, settingsReducer, SettingsState } from './settings.reducer';

const LOADED: SettingsState = {
  ...initialSettingsState,
  loaded: true,
  settings: { appearance: { colorScheme: 'system' }, shortcuts: { enabled: false } },
};

describe('settingsReducer', () => {
  it('changes only the selected colour scheme and keeps the other sections', () => {
    const state = settingsReducer(
      LOADED,
      SettingsActions.selectedColorScheme({ colorScheme: 'light' }),
    );
    expect(state.settings).toEqual<Settings>({
      appearance: { colorScheme: 'light' },
      shortcuts: { enabled: false },
    });
  });

  it('changes only the shortcut switch and keeps the other sections', () => {
    const state = settingsReducer(LOADED, SettingsActions.toggledShortcuts({ enabled: true }));
    expect(state.settings).toEqual<Settings>({
      appearance: { colorScheme: 'system' },
      shortcuts: { enabled: true },
    });
  });

  it('keeps the defaults when loading fails', () => {
    const error = new Error('SecurityError');
    const state = settingsReducer(undefined, SettingsActions.loadSettingsFailure({ error }));
    expect(state.loaded).toBe(true);
    // PS US-UI-01, E-06: dark by default; TS §11.10: shortcuts on.
    expect(state.settings).toEqual<Settings>({
      appearance: { colorScheme: 'dark' },
      shortcuts: { enabled: true },
    });
  });
});
