/** Appearance of the app on this device (PS US-UI-01); `system` follows `prefers-color-scheme`. */
export const COLOR_SCHEME_SETTINGS = ['system', 'dark', 'light'] as const;
export type ColorSchemeSetting = (typeof COLOR_SCHEME_SETTINGS)[number];

export interface AppearanceSettings {
  colorScheme: ColorSchemeSetting;
}

export interface ShortcutSettings {
  /** Shortcuts without a modifier (space, `+`, `−`) must be switchable (WCAG 2.1.4, TS §11.10). */
  enabled: boolean;
}

/**
 * Settings of this device in `pgo.settings` (TS §9.3), one section per topic. Later APs add
 * sections (colours, motion, toasts per event code); a stored entry without them gets their
 * defaults, so a new section needs no new version.
 */
export interface Settings {
  appearance: AppearanceSettings;
  shortcuts: ShortcutSettings;
}

/** Dark is the default appearance (E-06, PS US-UI-01). */
export const DEFAULT_SETTINGS: Settings = {
  appearance: { colorScheme: 'dark' },
  shortcuts: { enabled: true },
};
