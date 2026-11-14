export const COLOR_SCHEMES = ['dark', 'light'] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];

/** A fixed colour scheme or `system`, which follows `prefers-color-scheme`. */
export type ColorSchemePreference = ColorScheme | 'system';

/**
 * Colours of gains and losses (PS US-UI-02): green and red by default, blue and orange with the
 * class `colors-blue-orange` on `<html>`, which redefines `--pgo-up` and `--pgo-down` (TS §11.5).
 */
export const CHANGE_COLORS = ['green-red', 'blue-orange'] as const;
export type ChangeColors = (typeof CHANGE_COLORS)[number];
export const BLUE_ORANGE_CLASS = 'colors-blue-orange';

export const PREFERS_DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Resolves the active colour scheme. `prefersDark` is `null` where the platform has no media
 * queries; `system` is dark then, like the app's default (E-06).
 */
export function resolveColorScheme(
  preference: ColorSchemePreference,
  prefersDark: boolean | null,
): ColorScheme {
  if (preference !== 'system') {
    return preference;
  }
  return prefersDark === false ? 'light' : 'dark';
}
