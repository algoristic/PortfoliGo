export const COLOR_SCHEMES = ['dark', 'light'] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];

/** A fixed colour scheme or `system`, which follows `prefers-color-scheme`. */
export type ColorSchemePreference = ColorScheme | 'system';

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
