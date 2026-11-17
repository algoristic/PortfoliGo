import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { FormatGameTimePipe } from '@app/clock/ui/pipes/format-game-time/format-game-time.pipe';
import { BadgeComponent } from '@app/shared/ui/badge/badge.component';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { CardDirective } from '@app/shared/ui/card/card.directive';
import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';
import { FormatPricePipe } from '@app/shared/ui/pipes/format-price/format-price.pipe';
import { FormatQuantityPipe } from '@app/shared/ui/pipes/format-quantity/format-quantity.pipe';

import { openOrderRow } from '../labels/order-book-rows';
import { DepotReservation, OrderBookEntry } from '../models/order-book.model';

/**
 * Open and triggered orders (US-HD-04) in placement order: instrument, status, depot, side, size,
 * order type with limit and stop, validity and reservation, with „Ändern“ and „Stornieren“; above
 * them the reserved money per clearing account. Cards on phones, table rows from `md`.
 */
@Component({
  selector: 'app-open-orders',
  imports: [
    CardDirective,
    RouterLink,
    BadgeComponent,
    ButtonDirective,
    EmptyStateComponent,
    IconDirective,
    FormatCentsPipe,
    FormatGameTimePipe,
    FormatPricePipe,
    FormatQuantityPipe,
  ],
  templateUrl: './open-orders.component.html',
  host: { class: 'block' },
})
export class OpenOrdersComponent {
  entries = input.required<OrderBookEntry[]>();
  reservations = input<DepotReservation[]>([]);

  clickedChange = output<string>();
  clickedCancel = output<string>();

  rows = computed(() => this.entries().map(openOrderRow));
  reservationRows = computed(() =>
    this.reservations().map((reservation) => ({
      ...reservation,
      label:
        reservation.bankName === null
          ? $localize`:@@uiTrading-openOrders-reservationDepot:Verrechnungskonto zu Depot ${reservation.depotNumber}:number:`
          : $localize`:@@uiTrading-openOrders-reservationDepotAtBank:Verrechnungskonto zu Depot ${reservation.depotNumber}:number: · ${reservation.bankName}:bank:`,
    })),
  );

  label = $localize`:@@uiTrading-openOrders-label:Offene Orders`;

  onChange(orderId: string): void {
    this.clickedChange.emit(orderId);
  }

  onCancel(orderId: string): void {
    this.clickedCancel.emit(orderId);
  }
}
