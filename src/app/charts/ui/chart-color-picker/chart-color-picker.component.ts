import { Component, input, model, output } from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';

import {
  CHART_COLOR_BACKGROUND_CLASSES,
  CHART_COLORS,
  ChartColor,
} from '../models/chart-color.model';

let nextGroupId = 0;

/**
 * Choice of a chart colour (`--pgo-chart-1` … `-6`) as a radio group of swatches, bound with
 * `[formField]` to a field of `ChartColor`. Native radio buttons: Tab reaches the group, the arrow
 * keys change the colour. The group is named by `label`, every swatch by its colour name.
 */
@Component({
  selector: 'app-chart-color-picker',
  templateUrl: './chart-color-picker.component.html',
  host: { class: 'block' },
})
export class ChartColorPickerComponent implements FormValueControl<ChartColor> {
  value = model<ChartColor>('chart-1');
  /** Accessible name of the group. */
  label = input.required<string>();
  testId = input('chart-color-picker');
  disabled = input(false);

  colors = CHART_COLORS;
  swatchClasses = CHART_COLOR_BACKGROUND_CLASSES;
  groupName = `chart-color-${nextGroupId++}`;

  touch = output<void>();

  colorLabels: Record<ChartColor, string> = {
    'chart-1': $localize`:@@uiCharts-chartColorPicker-chart1:Blau`,
    'chart-2': $localize`:@@uiCharts-chartColorPicker-chart2:Orange`,
    'chart-3': $localize`:@@uiCharts-chartColorPicker-chart3:Grün`,
    'chart-4': $localize`:@@uiCharts-chartColorPicker-chart4:Violett`,
    'chart-5': $localize`:@@uiCharts-chartColorPicker-chart5:Türkis`,
    'chart-6': $localize`:@@uiCharts-chartColorPicker-chart6:Magenta`,
  };

  onSelect(color: ChartColor): void {
    this.value.set(color);
  }
}
