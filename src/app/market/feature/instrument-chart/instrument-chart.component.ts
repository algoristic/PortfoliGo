import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';

import { PriceChartComponent } from '@app/charts/ui/price-chart/price-chart.component';
import { PriceChartCrosshair } from '@app/charts/ui/price-chart/price-chart.model';
import { dayStartTick } from '@app/clock/domain/calendar-logic';
import { chosenChartDay } from '@app/market/domain/chart-view-logic';
import { CandleReadoutComponent } from '@app/market/ui/candle-readout/candle-readout.component';
import { ChartToolbarComponent } from '@app/market/ui/chart-toolbar/chart-toolbar.component';

import { MarketFacade } from '../state/market.facade';

/**
 * Live chart of the instrument in the route (US-CH-01): period, chart type, 1T day navigation, the
 * price chart and the crosshair readout. The candles come from the market slice (TS §11.3).
 */
@Component({
  selector: 'app-instrument-chart',
  imports: [CommonModule, CandleReadoutComponent, ChartToolbarComponent, PriceChartComponent],
  templateUrl: './instrument-chart.component.html',
  host: { class: 'block' },
})
export class InstrumentChartComponent {
  facade = inject(MarketFacade);

  crosshair = signal<PriceChartCrosshair | null>(null);

  chartLabel = $localize`:@@featureMarket-instrumentChart-chartLabel:Kursverlauf`;

  onMoveCrosshair(crosshair: PriceChartCrosshair | null): void {
    this.crosshair.set(crosshair);
  }

  onSubmitDate(day: number, today: number): void {
    this.facade.submitChartDate(chosenChartDay(day, dayStartTick(today)));
  }
}
