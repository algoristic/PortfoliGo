import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { WatchlistToggleComponent } from '@app/market/ui/watchlist-toggle/watchlist-toggle.component';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';

import { InstrumentChartComponent } from '../instrument-chart/instrument-chart.component';
import { MarketFacade } from '../state/market.facade';

/**
 * Instrument page (US-MK-03): so far the head with the watchlist star (US-MK-04) and the live
 * chart; the rest follows in AP 4.5.
 */
@Component({
  selector: 'app-instrument-page',
  imports: [CommonModule, PanelComponent, InstrumentChartComponent, WatchlistToggleComponent],
  templateUrl: './instrument.page.html',
  host: { class: 'block' },
})
export class InstrumentPage {
  facade = inject(MarketFacade);

  onToggleWatchlist(id: string, watched: boolean): void {
    if (watched) {
      this.facade.addToWatchlist(id);
    } else {
      this.facade.removeFromWatchlist(id);
    }
  }
}
