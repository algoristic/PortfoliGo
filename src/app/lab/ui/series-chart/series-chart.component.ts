import { Component, computed, input, output } from '@angular/core';

import { PriceChartComponent } from '@app/charts/ui/price-chart/price-chart.component';
import { PRICE_CHART_TYPES, PriceChartType } from '@app/charts/ui/price-chart/price-chart.model';
import { Candle, CandleResolution } from '@app/market/domain/models/candle.model';
import { SERIES_KINDS, SeriesKind } from '@app/market/domain/series';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { FormatNumberPipe } from '@app/shared/ui/pipes/format-number/format-number.pipe';
import { FormatPricePipe } from '@app/shared/ui/pipes/format-price/format-price.pipe';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';

import { CHART_RANGES, ChartRange, LabChartOptions, SeriesGroup } from './series-chart.model';

import { SeriesOption } from '../../domain/models/world-overview.model';

/** Series selection, chart options and the chart of the simulation lab. */
@Component({
  selector: 'app-series-chart',
  imports: [
    ButtonDirective,
    FormatNumberPipe,
    FormatPricePipe,
    PriceChartComponent,
    SkeletonComponent,
  ],
  templateUrl: './series-chart.component.html',
  host: { class: 'block' },
})
export class SeriesChartComponent {
  seriesOptions = input.required<SeriesOption[]>();
  series = input.required<number>();
  chartOptions = input.required<LabChartOptions>();
  allowedResolutions = input.required<readonly CandleResolution[]>();
  candles = input.required<Candle[]>();
  loading = input(false);
  loadingHistory = input(false);
  /** Duration of the last candle query in the worker. */
  candlesMs = input<number>();

  ranges = CHART_RANGES;
  chartTypes = PRICE_CHART_TYPES;

  selectedSeries = output<number>();
  changedChartOptions = output<Partial<LabChartOptions>>();
  scrolledToChartStart = output<void>();

  groups = computed<SeriesGroup[]>(() =>
    SERIES_KINDS.map((kind) => ({
      kind,
      label: this.kindLabels[kind],
      options: this.seriesOptions().filter((option) => option.kind === kind),
    })),
  );
  selectedOption = computed(() => this.seriesOptions()[this.series()]);
  lastClose = computed(() => this.candles().at(-1)?.close);

  kindLabels: Record<SeriesKind, string> = {
    stock: $localize`:@@uiLab-seriesChart-kindStock:Aktien`,
    index: $localize`:@@uiLab-seriesChart-kindIndex:Kursindizes`,
    'total-return': $localize`:@@uiLab-seriesChart-kindTotalReturn:Performanceindizes`,
    etf: $localize`:@@uiLab-seriesChart-kindEtf:ETFs`,
  };
  rangeLabels: Record<ChartRange, string> = {
    '1d': $localize`:@@uiLab-seriesChart-range1d:1 Tag`,
    '1w': $localize`:@@uiLab-seriesChart-range1w:1 Woche`,
    '3m': $localize`:@@uiLab-seriesChart-range3m:3 Monate`,
    '1y': $localize`:@@uiLab-seriesChart-range1y:1 Jahr`,
    max: $localize`:@@uiLab-seriesChart-rangeMax:Seit Epoche`,
  };
  resolutionLabels: Record<CandleResolution, string> = {
    '1m': $localize`:@@uiLab-seriesChart-resolution1m:1 Min.`,
    '5m': $localize`:@@uiLab-seriesChart-resolution5m:5 Min.`,
    '15m': $localize`:@@uiLab-seriesChart-resolution15m:15 Min.`,
    '1h': $localize`:@@uiLab-seriesChart-resolution1h:1 Std.`,
    '1d': $localize`:@@uiLab-seriesChart-resolution1d:1 Tag`,
    '1w': $localize`:@@uiLab-seriesChart-resolution1w:1 Woche`,
  };
  chartTypeLabels: Record<PriceChartType, string> = {
    line: $localize`:@@uiLab-seriesChart-chartTypeLine:Linie`,
    candles: $localize`:@@uiLab-seriesChart-chartTypeCandles:Kerzen`,
  };
  chartLabel = $localize`:@@uiLab-seriesChart-chartLabel:Kursverlauf`;

  onSelectSeries(value: string): void {
    const series = Number(value);
    if (series !== this.series()) {
      this.selectedSeries.emit(series);
    }
  }

  onSelectRange(range: ChartRange): void {
    if (range !== this.chartOptions().range) {
      this.changedChartOptions.emit({ range });
    }
  }

  onSelectResolution(resolution: CandleResolution): void {
    if (resolution !== this.chartOptions().resolution) {
      this.changedChartOptions.emit({ resolution });
    }
  }

  onSelectChartType(chartType: PriceChartType): void {
    if (chartType !== this.chartOptions().chartType) {
      this.changedChartOptions.emit({ chartType });
    }
  }

  onScrollToChartStart(): void {
    this.scrolledToChartStart.emit();
  }
}
