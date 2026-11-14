import { Component, computed, input, output, signal } from '@angular/core';

import { CHART_COLOR_BACKGROUND_CLASSES } from '@app/charts/ui/models/chart-color.model';
import { PriceChartComponent } from '@app/charts/ui/price-chart/price-chart.component';
import { PriceChartOverlay } from '@app/charts/ui/price-chart/price-chart.model';
import { dayStartTick } from '@app/clock/domain/calendar-logic';
import { FormatGameDatePipe } from '@app/clock/ui/pipes/format-game-date/format-game-date.pipe';
import { Candle } from '@app/market/domain/models/candle.model';
import {
  DailyPoint,
  HISTORY_RANGES,
  HistoryRange,
} from '@app/portfolio/domain/models/performance.model';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';

import { historyRangeLabel } from '../labels/dashboard-labels';

/** What the chart compares: the split into cash and securities, or the two comparison values. */
export const NET_WORTH_CHART_VIEWS = ['split', 'compare'] as const;
export type NetWorthChartView = (typeof NET_WORTH_CHART_VIEWS)[number];

interface LegendItem {
  id: string;
  label: string;
  swatchClass: string;
}

const EUROS_PER_CENT = 0.01;

function euros(cents: number): number {
  return cents * EUROS_PER_CENT;
}

function linePoints(
  points: readonly DailyPoint[],
  value: (point: DailyPoint) => number | null,
): { tick: number; value: number }[] {
  return points.flatMap((point) => {
    const cents = value(point);
    return cents === null ? [] : [{ tick: dayStartTick(point.day), value: euros(cents) }];
  });
}

/**
 * Net worth over time (US-PF-04, US-PF-05): one value per day end (thinned for long periods) as an
 * area, in the view „Aufteilung“ with cash and securities as lines, in „Vergleich“ with the
 * benchmark and the second comparison value; the period 1M … Max. The chart is a figure with a
 * name; a sentence with the first and the last value is its text alternative.
 */
@Component({
  selector: 'app-net-worth-chart',
  imports: [
    PanelComponent,
    PriceChartComponent,
    ButtonDirective,
    EmptyStateComponent,
    FormatCentsPipe,
    FormatGameDatePipe,
  ],
  templateUrl: './net-worth-chart.component.html',
  host: { class: 'block' },
})
export class NetWorthChartComponent {
  range = input.required<HistoryRange>();
  /** Points of the period; `null` until loaded. */
  points = input.required<readonly DailyPoint[] | null>();
  loading = input(false);

  ranges = HISTORY_RANGES;
  views = NET_WORTH_CHART_VIEWS;
  rangeLabels = Object.fromEntries(
    HISTORY_RANGES.map((range) => [range, historyRangeLabel(range)]),
  ) as Readonly<Record<HistoryRange, string>>;

  selectedRange = output<HistoryRange>();

  view = signal<NetWorthChartView>('split');

  candles = computed((): Candle[] =>
    (this.points() ?? []).map((point) => {
      const value = euros(point.netWorth);
      return { tick: dayStartTick(point.day), open: value, high: value, low: value, close: value };
    }),
  );
  overlays = computed((): PriceChartOverlay[] => {
    const points = this.points() ?? [];
    if (this.view() === 'split') {
      return [
        { id: 'securities', color: 'chart-4', points: linePoints(points, (p) => p.securities) },
        { id: 'cash', color: 'chart-2', points: linePoints(points, (p) => p.cash) },
      ];
    }
    return [
      {
        id: 'benchmark',
        color: 'chart-5',
        points: linePoints(points, (p) => p.benchmarkValue),
      },
      {
        id: 'comparison',
        color: 'chart-6',
        lineStyle: 'dashed',
        points: linePoints(points, (p) => p.comparison),
      },
    ];
  });
  legend = computed((): LegendItem[] => {
    const netWorth = { id: 'net-worth', label: this.netWorthLabel, swatchClass: 'bg-accent' };
    return this.view() === 'split'
      ? [
          netWorth,
          {
            id: 'securities',
            label: this.securitiesLabel,
            swatchClass: CHART_COLOR_BACKGROUND_CLASSES['chart-4'],
          },
          {
            id: 'cash',
            label: this.cashLabel,
            swatchClass: CHART_COLOR_BACKGROUND_CLASSES['chart-2'],
          },
        ]
      : [
          netWorth,
          {
            id: 'benchmark',
            label: this.benchmarkLabel,
            swatchClass: CHART_COLOR_BACKGROUND_CLASSES['chart-5'],
          },
          {
            id: 'comparison',
            label: this.comparisonLabel,
            swatchClass: CHART_COLOR_BACKGROUND_CLASSES['chart-6'],
          },
        ];
  });
  /** First and last value with the start of their day, for the text alternative. */
  summary = computed(() => {
    const points = this.points() ?? [];
    const first = points[0];
    const last = points.at(-1);
    return first === undefined || last === undefined
      ? null
      : {
          fromTick: dayStartTick(first.day),
          from: first.netWorth,
          toTick: dayStartTick(last.day),
          to: last.netWorth,
        };
  });

  heading = $localize`:@@uiDashboard-netWorthChart-heading:Vermögensverlauf`;
  chartLabel = $localize`:@@uiDashboard-netWorthChart-chartLabel:Gesamtvermögen je Tag`;
  netWorthLabel = $localize`:@@uiDashboard-netWorthChart-netWorth:Gesamtvermögen`;
  securitiesLabel = $localize`:@@uiDashboard-netWorthChart-securities:Wertpapiere`;
  cashLabel = $localize`:@@uiDashboard-netWorthChart-cash:Bargeld`;
  benchmarkLabel = $localize`:@@uiDashboard-netWorthChart-benchmark:Benchmark (Weltindex)`;
  comparisonLabel = $localize`:@@uiDashboard-netWorthChart-comparison:Ohne Anlegen (Gehaltskonto)`;
  viewLabels: Readonly<Record<NetWorthChartView, string>> = {
    split: $localize`:@@uiDashboard-netWorthChart-viewSplit:Aufteilung`,
    compare: $localize`:@@uiDashboard-netWorthChart-viewCompare:Vergleich`,
  };

  onSelectRange(range: HistoryRange): void {
    if (range !== this.range()) {
      this.selectedRange.emit(range);
    }
  }

  onSelectView(view: NetWorthChartView): void {
    this.view.set(view);
  }
}
