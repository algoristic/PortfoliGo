import { Component, computed, input, output } from '@angular/core';

import {
  CHART_COLOR_BACKGROUND_CLASSES,
  ChartColor,
} from '@app/charts/ui/models/chart-color.model';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { IconButtonDirective } from '@app/shared/ui/icon-button/icon-button.directive';
import { FormatPricePipe } from '@app/shared/ui/pipes/format-price/format-price.pipe';

import { indicatorLabel } from '../labels/indicator-labels';
import { ChartIndicatorReadout } from '../models/chart-indicator.model';

interface IndicatorRow {
  id: string;
  label: string;
  swatchClass: string;
  values: readonly number[] | null;
  editLabel: string;
  removeLabel: string;
}

/**
 * Legend of the chart indicators (US-CH-02): name, parameters and colour of each indicator with its
 * values under the crosshair or at the newest candle, buttons to change or remove it, and one to
 * add another while colours are free.
 */
@Component({
  selector: 'app-chart-indicators',
  imports: [ButtonDirective, FormatPricePipe, IconButtonDirective, IconDirective],
  templateUrl: './chart-indicators.component.html',
  host: { class: 'block' },
})
export class ChartIndicatorsComponent {
  indicators = input.required<readonly ChartIndicatorReadout[]>();
  canAdd = input.required<boolean>();

  clickedAdd = output<void>();
  clickedEdit = output<string>();
  clickedRemove = output<string>();

  rows = computed((): IndicatorRow[] =>
    this.indicators().map((indicator) => {
      const label = indicatorLabel(indicator.spec);
      return {
        id: indicator.id,
        label,
        swatchClass: swatchClass(indicator.color),
        values: indicator.values,
        editLabel: $localize`:@@uiMarket-chartIndicators-edit:${label}:LABEL: ändern`,
        removeLabel: $localize`:@@uiMarket-chartIndicators-remove:${label}:LABEL: entfernen`,
      };
    }),
  );

  onAdd(): void {
    this.clickedAdd.emit();
  }

  onEdit(id: string): void {
    this.clickedEdit.emit(id);
  }

  onRemove(id: string): void {
    this.clickedRemove.emit(id);
  }
}

function swatchClass(color: ChartColor): string {
  return `size-2.5 shrink-0 rounded-full ${CHART_COLOR_BACKGROUND_CLASSES[color]}`;
}
