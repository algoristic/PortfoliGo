/** Category colours of charts (`--pgo-chart-*` tokens): donut segments, overlays, legends. */
export const CHART_COLORS = [
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'chart-6',
] as const;
export type ChartColor = (typeof CHART_COLORS)[number];

/** Full class names, so that Tailwind finds them when scanning the sources. */
export const CHART_COLOR_STROKE_CLASSES: Readonly<Record<ChartColor, string>> = {
  'chart-1': 'stroke-chart-1',
  'chart-2': 'stroke-chart-2',
  'chart-3': 'stroke-chart-3',
  'chart-4': 'stroke-chart-4',
  'chart-5': 'stroke-chart-5',
  'chart-6': 'stroke-chart-6',
};

/** Swatches for the legends the callers draw. */
export const CHART_COLOR_BACKGROUND_CLASSES: Readonly<Record<ChartColor, string>> = {
  'chart-1': 'bg-chart-1',
  'chart-2': 'bg-chart-2',
  'chart-3': 'bg-chart-3',
  'chart-4': 'bg-chart-4',
  'chart-5': 'bg-chart-5',
  'chart-6': 'bg-chart-6',
};
