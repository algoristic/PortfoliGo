// jsdom has no layout, so media queries never match (`src/test-setup.ts`). Pages that switch their
// layout with the `BreakpointObserver` get a viewport width here.

const ROOT_FONT_SIZE_PX = 16;

/**
 * Evaluates `(min-width: …)` queries against `width` (in px); other queries don't match. Call it
 * before the page is created: the CDK binds `matchMedia` when it starts. Returns the cleanup.
 */
export function installViewport(width: number): () => void {
  const spy = vi
    .spyOn(window, 'matchMedia')
    .mockImplementation((query: string) => mediaQueryList(query, matchesWidth(query, width)));
  return () => spy.mockRestore();
}

function matchesWidth(query: string, width: number): boolean {
  const match = /^\(min-width:\s*([\d.]+)(px|rem)\)$/.exec(query.trim());
  if (match === null) {
    return false;
  }
  const minWidth = Number(match[1]) * (match[2] === 'rem' ? ROOT_FONT_SIZE_PX : 1);
  return width >= minWidth;
}

function mediaQueryList(query: string, matches: boolean): MediaQueryList {
  return {
    matches,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  } as MediaQueryList;
}
