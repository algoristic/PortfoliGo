import {
  COLOR_SCHEME_SETTINGS,
  ColorSchemeSetting,
  DEFAULT_SETTINGS,
  Settings,
} from './models/settings.model';

/**
 * Settings from the stored `data` of `pgo.settings` (TS §9.3): every value that is missing or
 * invalid gets its default, valid values of other sections are kept. `src/index.html` reads
 * `appearance.colorScheme` the same way before Angular starts.
 */
export function parseSettings(data: unknown): Settings {
  const appearance = sectionOf(data, 'appearance');
  const shortcuts = sectionOf(data, 'shortcuts');
  return {
    appearance: {
      colorScheme: isColorSchemeSetting(appearance['colorScheme'])
        ? appearance['colorScheme']
        : DEFAULT_SETTINGS.appearance.colorScheme,
    },
    shortcuts: {
      enabled:
        typeof shortcuts['enabled'] === 'boolean'
          ? shortcuts['enabled']
          : DEFAULT_SETTINGS.shortcuts.enabled,
    },
  };
}

function sectionOf(data: unknown, key: string): Record<string, unknown> {
  const section = isRecord(data) ? data[key] : undefined;
  return isRecord(section) ? section : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isColorSchemeSetting(value: unknown): value is ColorSchemeSetting {
  return (COLOR_SCHEME_SETTINGS as readonly unknown[]).includes(value);
}
