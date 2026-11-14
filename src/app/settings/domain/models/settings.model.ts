import {
  DEFAULT_NOTIFICATION_CHANNEL_SETTINGS,
  NotificationChannelSettings,
} from '@app/notifications/domain/models/notification-channel.model';
import { DEFAULT_LANGUAGE, Language } from '@app/shared/util/locale';

/** Appearance of the app on this device (PS US-UI-01); `system` follows `prefers-color-scheme`. */
export const COLOR_SCHEME_SETTINGS = ['system', 'dark', 'light'] as const;
export type ColorSchemeSetting = (typeof COLOR_SCHEME_SETTINGS)[number];

/**
 * Colours of gains and losses (PS US-UI-02, TS §11.5): green and red, or blue and orange for
 * red-green colour vision deficiency. Signs and arrows stay in both.
 */
export const CHANGE_COLOR_SETTINGS = ['green-red', 'blue-orange'] as const;
export type ChangeColorSetting = (typeof CHANGE_COLOR_SETTINGS)[number];

export interface AppearanceSettings {
  colorScheme: ColorSchemeSetting;
  changeColors: ChangeColorSetting;
}

export interface MotionSettings {
  /** Short highlight of changed prices (PS US-MK-05); never shown with "reduce motion". */
  priceHighlight: boolean;
}

export interface ShortcutSettings {
  /** Shortcuts without a modifier (space, `+`, `−`) must be switchable (WCAG 2.1.4, TS §11.10). */
  enabled: boolean;
}

export interface LocaleSettings {
  /** Language of texts and formats (PS US-UI-11, E-36); a change reloads the app. */
  language: Language;
}

/**
 * Settings of this device in `pgo.settings` (TS §9.3), one section per topic. A stored entry
 * without a section or with invalid values gets their defaults, so a new section needs no new
 * version.
 */
export interface Settings {
  appearance: AppearanceSettings;
  locale: LocaleSettings;
  motion: MotionSettings;
  shortcuts: ShortcutSettings;
  /** Toast and browser notification per code where this device differs from TS §12. */
  notifications: NotificationChannelSettings;
}

/** Dark is the default appearance (E-06, PS US-UI-01), German the default language (E-36). */
export const DEFAULT_SETTINGS: Settings = {
  appearance: { colorScheme: 'dark', changeColors: 'green-red' },
  locale: { language: DEFAULT_LANGUAGE },
  motion: { priceHighlight: true },
  shortcuts: { enabled: true },
  notifications: DEFAULT_NOTIFICATION_CHANNEL_SETTINGS,
};
