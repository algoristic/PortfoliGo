import { createAction, props } from '@ngrx/store';

import { NotificationChannel } from '@app/notifications/domain/models/notification-channel.model';
import { NotificationCode } from '@app/notifications/domain/models/notification.model';
import {
  ChangeColorSetting,
  ColorSchemeSetting,
  Settings,
} from '@app/settings/domain/models/settings.model';
import { Language } from '@app/shared/util/locale';

/** The app starts; the settings load before the first route (`provideSettingsState()`). */
export const enterApp = createAction('[Settings/Page] Enter app');
export const selectedColorScheme = createAction(
  '[Settings/Page] Selected color scheme',
  props<{ colorScheme: ColorSchemeSetting }>(),
);
/** Saved, then the app reloads in the new language (TS §11.9, E-36). */
export const selectedLanguage = createAction(
  '[Settings/Page] Selected language',
  props<{ language: Language }>(),
);
export const selectedChangeColors = createAction(
  '[Settings/Page] Selected change colors',
  props<{ changeColors: ChangeColorSetting }>(),
);
export const toggledPriceHighlight = createAction(
  '[Settings/Page] Toggled price highlight',
  props<{ enabled: boolean }>(),
);
export const toggledNotificationChannel = createAction(
  '[Settings/Page] Toggled notification channel',
  props<{ channel: NotificationChannel; code: NotificationCode; enabled: boolean }>(),
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
export const saveLanguageSuccess = createAction('[Settings/API] Save language success');
export const saveSettingsFailure = createAction(
  '[Settings/API] Save settings failure',
  props<{ error: unknown }>(),
);
