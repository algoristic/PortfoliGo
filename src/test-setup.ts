// Polyfills for running unit tests under jsdom (the default Vitest environment).
// jsdom does not implement `window.matchMedia`, which e.g. the CDK `BreakpointObserver` queries.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
