import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { DEFAULT_INDICATOR_SPECS } from '@app/analysis/domain/indicator-logic';
import { IndicatorSpec } from '@app/analysis/domain/models/indicator.model';
import { PriceChartComponent } from '@app/charts/ui/price-chart/price-chart.component';
import {
  PriceChartCrosshair,
  PriceChartOverlay,
} from '@app/charts/ui/price-chart/price-chart.model';
import { dayStartTick } from '@app/clock/domain/calendar-logic';
import { ChartIndicatorSet } from '@app/market/domain/chart-indicator-logic';
import { chosenChartDay } from '@app/market/domain/chart-view-logic';
import { IndicatorLines } from '@app/market/domain/models/chart.model';
import { CandleReadoutComponent } from '@app/market/ui/candle-readout/candle-readout.component';
import { ChartIndicatorsComponent } from '@app/market/ui/chart-indicators/chart-indicators.component';
import { ChartToolbarComponent } from '@app/market/ui/chart-toolbar/chart-toolbar.component';
import { FormIndicatorComponent } from '@app/market/ui/form-indicator/form-indicator.component';
import { ChartIndicatorReadout } from '@app/market/ui/models/chart-indicator.model';

import { MarketFacade } from '../state/market.facade';
import { MAX_CHART_INDICATORS } from '../state/market.model';

/** The indicator being added (`id` `null`) or changed. */
interface IndicatorEdit {
  id: string | null;
  spec: IndicatorSpec;
}

/** Overlay ids of the Bollinger lines; the bands are dashed. */
const BOLLINGER_LINES = ['middle', 'upper', 'lower'] as const;

/**
 * Live chart of the instrument in the route (US-CH-01, US-CH-02): period, chart type, 1T day
 * navigation, indicators, the price chart and the crosshair readout. The candles come from the
 * market slice (TS §11.3); the indicators are computed here from the shown candles and continued
 * incrementally on live updates (`ChartIndicatorSet`, TS §11.7).
 */
@Component({
  selector: 'app-instrument-chart',
  imports: [
    CommonModule,
    CandleReadoutComponent,
    ChartIndicatorsComponent,
    ChartToolbarComponent,
    FormIndicatorComponent,
    PriceChartComponent,
  ],
  templateUrl: './instrument-chart.component.html',
  host: { class: 'block' },
})
export class InstrumentChartComponent {
  facade = inject(MarketFacade);

  readonly #indicatorSet = new ChartIndicatorSet();

  crosshair = signal<PriceChartCrosshair | null>(null);
  editing = signal<IndicatorEdit | null>(null);

  chart = toSignal(this.facade.chart$, { initialValue: null });
  /** The lines of every indicator over the shown candles, by indicator id. */
  #indicatorLines = computed((): ReadonlyMap<string, IndicatorLines> => {
    const chart = this.chart();
    return chart === null ? new Map() : this.#indicatorSet.update(chart.candles, chart.indicators);
  });
  overlays = computed((): PriceChartOverlay[] => {
    const lines = this.#indicatorLines();
    return (this.chart()?.indicators ?? []).flatMap(({ id, spec, color }) => {
      const indicatorLines = lines.get(id) ?? [];
      return spec.kind === 'bollinger'
        ? indicatorLines.map((points, index) => ({
            id: `${id}.${BOLLINGER_LINES[index]}`,
            points,
            color,
            lineStyle: index === 0 ? ('solid' as const) : ('dashed' as const),
          }))
        : indicatorLines.map((points) => ({ id, points, color }));
    });
  });
  /** Indicator values under the crosshair, otherwise at the newest candle. */
  indicatorReadouts = computed((): ChartIndicatorReadout[] => {
    const crosshair = this.crosshair();
    const lines = this.#indicatorLines();
    return (this.chart()?.indicators ?? []).map((indicator) => {
      const indicatorLines = lines.get(indicator.id) ?? [];
      const values = crosshair
        ? crosshairValues(crosshair, indicator.id, indicator.spec)
        : indicatorLines.map((points) => points.at(-1)?.value ?? Number.NaN);
      return {
        ...indicator,
        values: values.length > 0 && values.every(Number.isFinite) ? values : null,
      };
    });
  });
  canAddIndicator = computed(() => (this.chart()?.indicators.length ?? 0) < MAX_CHART_INDICATORS);

  chartLabel = $localize`:@@featureMarket-instrumentChart-chartLabel:Kursverlauf`;

  onMoveCrosshair(crosshair: PriceChartCrosshair | null): void {
    this.crosshair.set(crosshair);
  }

  onSubmitDate(day: number, today: number): void {
    this.facade.submitChartDate(chosenChartDay(day, dayStartTick(today)));
  }

  onAddIndicator(): void {
    this.editing.set({ id: null, spec: DEFAULT_INDICATOR_SPECS.sma });
  }

  onEditIndicator(id: string): void {
    const indicator = this.chart()?.indicators.find((other) => other.id === id);
    if (indicator !== undefined) {
      this.editing.set({ id, spec: indicator.spec });
    }
  }

  onRemoveIndicator(id: string): void {
    if (this.editing()?.id === id) {
      this.editing.set(null);
    }
    this.facade.removeChartIndicator(id);
  }

  onSubmitIndicator(spec: IndicatorSpec, id: string | null): void {
    this.editing.set(null);
    this.facade.submitChartIndicator(id, spec);
  }

  onCancelIndicator(): void {
    this.editing.set(null);
  }
}

function crosshairValues(
  crosshair: PriceChartCrosshair,
  id: string,
  spec: IndicatorSpec,
): number[] {
  const ids = spec.kind === 'bollinger' ? BOLLINGER_LINES.map((line) => `${id}.${line}`) : [id];
  return ids.map(
    (lineId) => crosshair.overlays.find((overlay) => overlay.id === lineId)?.value ?? Number.NaN,
  );
}
