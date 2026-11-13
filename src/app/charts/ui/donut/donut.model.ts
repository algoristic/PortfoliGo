import { ChartColor } from '../models/chart-color.model';

/** A segment of the donut: its value (the shares follow from the sum) and its category colour. */
export interface DonutSegment {
  id: string;
  value: number;
  color: ChartColor;
}
