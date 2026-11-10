export const COLOR_SCHEMES = ['dark', 'light'] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];

export const PREFERS_DARK_QUERY = '(prefers-color-scheme: dark)';

/** Resolves the active colour scheme from the system preference. Settings follow in AP 6.2. */
export function resolveColorScheme(prefersDark: boolean): ColorScheme {
  return prefersDark ? 'dark' : 'light';
}
