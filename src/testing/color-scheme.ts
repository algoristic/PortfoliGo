// jsdom has no media queries (`src/test-setup.ts`). Tests of the colour scheme get a system
// preference here that they can change like the user does in the system settings.

const PREFERS_DARK_QUERY = '(prefers-color-scheme: dark)';

export interface SystemColorScheme {
  /** Changes the system preference and reports it to the listeners, like the browser does. */
  set(prefersDark: boolean): void;
  restore(): void;
}

/**
 * Answers `(prefers-color-scheme: dark)` with `prefersDark` and passes other queries on (e.g. to
 * `installViewport`). Call it before the page is created.
 */
export function installSystemColorScheme(prefersDark: boolean): SystemColorScheme {
  const previous = window.matchMedia;
  let matches = prefersDark;
  let listeners: Array<(event: MediaQueryListEvent) => void> = [];
  window.matchMedia = (query: string): MediaQueryList =>
    query.trim() === PREFERS_DARK_QUERY
      ? ({
          get matches() {
            return matches;
          },
          media: query,
          onchange: null,
          addListener: () => undefined,
          removeListener: () => undefined,
          addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
            listeners.push(listener);
          },
          removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
            listeners = listeners.filter((l) => l !== listener);
          },
          dispatchEvent: () => false,
        } as unknown as MediaQueryList)
      : previous.call(window, query);
  return {
    set: (value) => {
      matches = value;
      listeners.forEach((listener) => listener({ matches: value } as MediaQueryListEvent));
    },
    restore: () => {
      window.matchMedia = previous;
    },
  };
}
