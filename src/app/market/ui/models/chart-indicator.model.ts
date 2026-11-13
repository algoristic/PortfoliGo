import { IndicatorSpec } from '@app/analysis/domain/models/indicator.model';
import { ChartColor } from '@app/charts/ui/models/chart-color.model';

/** An indicator over the chart (US-CH-02) with its own colour; `id` is stable while it exists. */
export interface ChartIndicator {
  id: string;
  spec: IndicatorSpec;
  color: ChartColor;
}

/**
 * The values of an indicator under the crosshair or at the newest candle: `[value]` or
 * `[middle, upper, lower]`; `null` where the indicator has no value yet.
 */
export interface ChartIndicatorReadout extends ChartIndicator {
  values: readonly number[] | null;
}
