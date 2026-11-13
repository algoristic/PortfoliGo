// lightweight-charts needs a container size and colours; jsdom has neither layout nor the global
// stylesheet with the `--pgo-*` tokens.

const CHART_TOKENS: Record<string, string> = {
  surface: '#ffffff',
  fg: '#1f2937',
  'fg-muted': '#4b5563',
  border: '#d1d5db',
  accent: '#2563eb',
  up: '#15803d',
  down: '#b91c1c',
  'chart-1': '#1f6fd1',
  'chart-2': '#c4520f',
  'chart-3': '#2b8a3e',
  'chart-4': '#8e3fb0',
  'chart-5': '#0b7f8f',
  'chart-6': '#c2255c',
};

/**
 * Gives every element the size `width` × `height` and sets the chart tokens on `<html>`. Returns
 * the cleanup, e.g. for `afterEach`.
 */
export function installChartPlatform(width = 800, height = 400): () => void {
  const rect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
  const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect);
  const root = document.documentElement;
  for (const [name, value] of Object.entries(CHART_TOKENS)) {
    root.style.setProperty(`--pgo-${name}`, value);
  }
  return () => {
    spy.mockRestore();
    for (const name of Object.keys(CHART_TOKENS)) {
      root.style.removeProperty(`--pgo-${name}`);
    }
  };
}
