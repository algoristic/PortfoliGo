// Platform features that jsdom (the default Vitest environment) lacks. They only fill gaps of the
// platform; the code under test runs unchanged (CLAUDE.md §10).

// `window.matchMedia` is queried e.g. by the CDK `BreakpointObserver` and the colour scheme.
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

// jsdom has no layout, so sizes never change: a silent `ResizeObserver` is enough. Tests that need a
// size stub `getBoundingClientRect` (see `src/testing/chart-platform.ts`).
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe = (): void => undefined;
    unobserve = (): void => undefined;
    disconnect = (): void => undefined;
  };
}

// jsdom does not draw on canvases. A 2D context that ignores drawing lets canvas libraries such as
// lightweight-charts run their logic (scales, ranges, events).
const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();
HTMLCanvasElement.prototype.getContext = function (
  this: HTMLCanvasElement,
  contextId: string,
): CanvasRenderingContext2D | null {
  if (contextId !== '2d') {
    return null;
  }
  let context = contexts.get(this);
  if (context === undefined) {
    context = createDrawingFreeContext(this);
    contexts.set(this, context);
  }
  return context;
} as HTMLCanvasElement['getContext'];

function createDrawingFreeContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const gradient = { addColorStop: (): void => undefined };
  const methods: Record<PropertyKey, unknown> = {
    // Text width grows with the text, so axis widths stay plausible and deterministic.
    measureText: (text: string) => ({
      width: text.length * 6,
      actualBoundingBoxAscent: 8,
      actualBoundingBoxDescent: 2,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: text.length * 6,
    }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createConicGradient: () => gradient,
    createPattern: () => null,
    getLineDash: () => [],
    isPointInPath: () => false,
    isPointInStroke: () => false,
  };
  const state: Record<PropertyKey, unknown> = { canvas };
  return new Proxy(state, {
    get: (target, key) => {
      if (key in target) {
        return target[key];
      }
      return key in methods ? methods[key] : (): void => undefined;
    },
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}
