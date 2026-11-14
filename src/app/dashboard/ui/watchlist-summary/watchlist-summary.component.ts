import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';
import { FormatPricePipe } from '@app/shared/ui/pipes/format-price/format-price.pipe';
import { PriceChangeComponent } from '@app/shared/ui/price-change/price-change.component';
import { ValueFlashDirective } from '@app/shared/ui/value-flash/value-flash.directive';

import { WatchlistSummary } from '../models/dashboard-view.model';

/** The first entries of the watchlist (US-MK-04) with their live price and change of the day. */
@Component({
  selector: 'app-watchlist-summary',
  imports: [
    RouterLink,
    PanelComponent,
    EmptyStateComponent,
    PriceChangeComponent,
    ValueFlashDirective,
    FormatPricePipe,
  ],
  templateUrl: './watchlist-summary.component.html',
  host: { class: 'block' },
})
export class WatchlistSummaryComponent {
  watchlist = input.required<WatchlistSummary>();

  heading = $localize`:@@uiDashboard-watchlistSummary-heading:Watchlist`;
}
