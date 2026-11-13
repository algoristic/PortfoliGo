import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { FormatGameTimePipe } from '@app/clock/ui/pipes/format-game-time/format-game-time.pipe';
import { BadgeComponent } from '@app/shared/ui/badge/badge.component';
import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';
import { FormatPricePipe } from '@app/shared/ui/pipes/format-price/format-price.pipe';
import { FormatQuantityPipe } from '@app/shared/ui/pipes/format-quantity/format-quantity.pipe';

import { closedOrderRow } from '../labels/order-book-rows';
import { OrderBookEntry } from '../models/order-book.model';

/**
 * Closed orders newest first (US-HD-04): executed ones with time, shares, price, costs and total,
 * rejected ones with the reason, cancelled and expired ones with the time they closed. Cards on
 * phones, table rows from `md`.
 */
@Component({
  selector: 'app-order-history',
  imports: [
    RouterLink,
    BadgeComponent,
    EmptyStateComponent,
    FormatCentsPipe,
    FormatGameTimePipe,
    FormatPricePipe,
    FormatQuantityPipe,
  ],
  templateUrl: './order-history.component.html',
  host: { class: 'block' },
})
export class OrderHistoryComponent {
  entries = input.required<OrderBookEntry[]>();

  rows = computed(() => this.entries().map(closedOrderRow));

  label = $localize`:@@uiTrading-orderHistory-label:Orderhistorie`;
}
