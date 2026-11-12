import { PriceChartType } from '@app/charts/ui/price-chart/price-chart.model';
import { CandleResolution } from '@app/market/domain/models/candle.model';
import { SeriesKind } from '@app/market/domain/series';

import { SeriesOption } from '../../domain/models/world-overview.model';

export interface SeriesGroup {
  kind: SeriesKind;
  label: string;
  options: SeriesOption[];
}

/** Visible period of the lab chart, counted back from the current tick. */
export const CHART_RANGES = ['1d', '1w', '3m', '1y', 'max'] as const;
export type ChartRange = (typeof CHART_RANGES)[number];

export interface LabChartOptions {
  range: ChartRange;
  resolution: CandleResolution;
  chartType: PriceChartType;
}
