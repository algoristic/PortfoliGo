import { Component, computed, input, output } from '@angular/core';

import { SeriesGroup } from './section-series-chart.model';

import { PriceChartComponent } from '../../../charts/ui/price-chart/price-chart.component';
import {
  PRICE_CHART_TYPES,
  PriceChartType,
} from '../../../charts/ui/price-chart/price-chart.model';
import { Candle, CandleResolution } from '../../../market/domain/models/candle.model';
import { SERIES_KINDS, SeriesKind } from '../../../market/domain/series';
import { ButtonDirective } from '../../../shared/ui/button/button.directive';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { formatPrice } from '../../../shared/util/format';
import { SeriesOption } from '../../domain/models/world-overview.model';
import { CHART_RANGES, ChartRange, LabChartOptions } from '../state/lab.model';

/** Series selection, chart options and the chart of the simulation lab. */
@Component({
  selector: 'app-section-series-chart',
  imports: [ButtonDirective, PriceChartComponent, SkeletonComponent],
  templateUrl: './section-series-chart.component.html',
  styleUrl: './section-series-chart.component.scss',
})
export class SectionSeriesChartComponent {
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
  lastClose = computed(() => {
    const last = this.candles().at(-1);
    return last === undefined ? '–' : formatPrice(last.close);
  });

  kindLabels: Record<SeriesKind, string> = {
    stock: $localize`:@@featureLab-sectionSeriesChart-kindStock:Aktien`,
    index: $localize`:@@featureLab-sectionSeriesChart-kindIndex:Kursindizes`,
    'total-return': $localize`:@@featureLab-sectionSeriesChart-kindTotalReturn:Performanceindizes`,
    etf: $localize`:@@featureLab-sectionSeriesChart-kindEtf:ETFs`,
  };
  rangeLabels: Record<ChartRange, string> = {
    '1d': $localize`:@@featureLab-sectionSeriesChart-range1d:1 Tag`,
    '1w': $localize`:@@featureLab-sectionSeriesChart-range1w:1 Woche`,
    '3m': $localize`:@@featureLab-sectionSeriesChart-range3m:3 Monate`,
    '1y': $localize`:@@featureLab-sectionSeriesChart-range1y:1 Jahr`,
    max: $localize`:@@featureLab-sectionSeriesChart-rangeMax:Seit Epoche`,
  };
  resolutionLabels: Record<CandleResolution, string> = {
    '1m': $localize`:@@featureLab-sectionSeriesChart-resolution1m:1 Min.`,
    '5m': $localize`:@@featureLab-sectionSeriesChart-resolution5m:5 Min.`,
    '15m': $localize`:@@featureLab-sectionSeriesChart-resolution15m:15 Min.`,
    '1h': $localize`:@@featureLab-sectionSeriesChart-resolution1h:1 Std.`,
    '1d': $localize`:@@featureLab-sectionSeriesChart-resolution1d:1 Tag`,
    '1w': $localize`:@@featureLab-sectionSeriesChart-resolution1w:1 Woche`,
  };
  chartTypeLabels: Record<PriceChartType, string> = {
    line: $localize`:@@featureLab-sectionSeriesChart-chartTypeLine:Linie`,
    candles: $localize`:@@featureLab-sectionSeriesChart-chartTypeCandles:Kerzen`,
  };
  chartLabel = $localize`:@@featureLab-sectionSeriesChart-chartLabel:Kursverlauf`;

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
