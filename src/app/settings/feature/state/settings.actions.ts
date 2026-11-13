import { createAction, props } from '@ngrx/store';

import { ColorSchemeSetting, Settings } from '@app/settings/domain/models/settings.model';

/** The app starts; the settings load before the first route (`provideSettingsState()`). */
export const enterApp = createAction('[Settings/Page] Enter app');
export const selectedColorScheme = createAction(
  '[Settings/Page] Selected color scheme',
  props<{ colorScheme: ColorSchemeSetting }>(),
);
export const toggledShortcuts = createAction(
  '[Settings/Page] Toggled shortcuts',
  props<{ enabled: boolean }>(),
);

export const loadedSettings = createAction(
  '[Settings/API] Loaded settings',
  props<{ settings: Settings }>(),
);
export const loadSettingsFailure = createAction(
  '[Settings/API] Load settings failure',
  props<{ error: unknown }>(),
);
export const saveSettingsFailure = createAction(
  '[Settings/API] Save settings failure',
  props<{ error: unknown }>(),
);
