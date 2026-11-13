import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { PanelComponent } from '@app/shared/ui/panel/panel.component';

import { InstrumentChartComponent } from '../instrument-chart/instrument-chart.component';
import { MarketFacade } from '../state/market.facade';

/** Instrument page (US-MK-03): so far the head and the live chart; the rest follows in AP 4.5. */
@Component({
  selector: 'app-instrument-page',
  imports: [CommonModule, PanelComponent, InstrumentChartComponent],
  templateUrl: './instrument.page.html',
  host: { class: 'block' },
})
export class InstrumentPage {
  facade = inject(MarketFacade);
}
