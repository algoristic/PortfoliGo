import { IndicatorSpec } from '@app/analysis/domain/models/indicator.model';
import { ChartColor } from '@app/charts/ui/models/chart-color.model';

/** What the indicator form edits; the multiplier comes from a select as text. */
export interface IndicatorFormModel {
  period: number | null;
  multiplier: string;
  color: ChartColor;
}

/** The submitted indicator: parameters and colour. */
export interface SubmittedIndicator {
  spec: IndicatorSpec;
  color: ChartColor;
}
