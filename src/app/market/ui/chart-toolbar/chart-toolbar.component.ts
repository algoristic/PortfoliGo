import { Component, computed, input, output } from '@angular/core';

import { PRICE_CHART_TYPES, PriceChartType } from '@app/charts/ui/price-chart/price-chart.model';
import { dayIndex, dayStartTick } from '@app/clock/domain/calendar-logic';
import { parseDateTimeInput, toDateInputValue } from '@app/clock/domain/game-time-input';
import { Tick } from '@app/clock/domain/models/time.model';
import { FormatGameDatePipe } from '@app/clock/ui/pipes/format-game-date/format-game-date.pipe';
import { CHART_RANGES, ChartRange } from '@app/market/domain/models/chart.model';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';

/**
 * Controls of the price chart (US-CH-01): period, chart type and, for 1T, the day navigation with
 * previous and next market day, a date field and „Heute“ back to the live day.
 */
@Component({
  selector: 'app-chart-toolbar',
  imports: [ButtonDirective, FormatGameDatePipe, IconDirective],
  templateUrl: './chart-toolbar.component.html',
  host: { class: 'block' },
})
export class ChartToolbarComponent {
  range = input.required<ChartRange>();
  chartType = input.required<PriceChartType>();
  live = input.required<boolean>();
  /** Start of the shown 1T day. */
  shownDayTick = input.required<Tick>();
  /** The market day before the shown one, `null` at the first market day. */
  previousDay = input.required<number | null>();
  /** The day after the shown one (`null` = live); `undefined` while live. */
  nextDay = input.required<number | null | undefined>();
  today = input.required<number>();

  ranges = CHART_RANGES;
  chartTypes = PRICE_CHART_TYPES;
  minDate = toDateInputValue(0);

  selectedRange = output<ChartRange>();
  selectedChartType = output<PriceChartType>();
  /** A day from the navigation; `null` is the live day. */
  selectedDay = output<number | null>();
  /** The day index of the date field as entered (the caller picks the market day). */
  submittedDate = output<number>();

  dateValue = computed(() => toDateInputValue(this.shownDayTick()));
  maxDate = computed(() => toDateInputValue(dayStartTick(this.today())));

  rangeLabels: Record<ChartRange, string> = {
    '1d': $localize`:@@uiMarket-chartToolbar-range1d:1T`,
    '5d': $localize`:@@uiMarket-chartToolbar-range5d:5T`,
    '1m': $localize`:@@uiMarket-chartToolbar-range1m:1M`,
    '6m': $localize`:@@uiMarket-chartToolbar-range6m:6M`,
    '1y': $localize`:@@uiMarket-chartToolbar-range1y:1J`,
    '5y': $localize`:@@uiMarket-chartToolbar-range5y:5J`,
    max: $localize`:@@uiMarket-chartToolbar-rangeMax:Max`,
  };
  chartTypeLabels: Record<PriceChartType, string> = {
    line: $localize`:@@uiMarket-chartToolbar-chartTypeLine:Linie`,
    area: $localize`:@@uiMarket-chartToolbar-chartTypeArea:Fläche`,
    candles: $localize`:@@uiMarket-chartToolbar-chartTypeCandles:Kerzen`,
  };

  onSelectRange(range: ChartRange): void {
    if (range !== this.range() || !this.live()) {
      this.selectedRange.emit(range);
    }
  }

  onSelectChartType(chartType: PriceChartType): void {
    if (chartType !== this.chartType()) {
      this.selectedChartType.emit(chartType);
    }
  }

  onSelectDay(day: number | null | undefined): void {
    if (day !== undefined) {
      this.selectedDay.emit(day);
    }
  }

  onChangeDate(value: string): void {
    const tick = parseDateTimeInput(value, '');
    if (tick !== null) {
      this.submittedDate.emit(dayIndex(tick));
    }
  }
}
