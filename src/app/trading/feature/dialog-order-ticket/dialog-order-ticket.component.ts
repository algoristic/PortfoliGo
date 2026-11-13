import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { OrderSpec } from '@app/trading/domain/models/order.model';
import { FormOrderTicketComponent } from '@app/trading/ui/form-order-ticket/form-order-ticket.component';

import { OrderTicketDialogData, OrderTicketDialogResult } from './dialog-order-ticket.model';

import { TradingFacade } from '../state/trading.facade';

/**
 * The order ticket (US-HD-01–03, TS §11.8): the form follows the live quote, the clearing account,
 * the position and the tax year of the store while it is open. `TradingDialogEffects` opens it and
 * sends the order; the engine checks it again.
 */
@Component({
  selector: 'app-dialog-order-ticket',
  imports: [CommonModule, FormOrderTicketComponent],
  templateUrl: './dialog-order-ticket.component.html',
  host: { class: 'block' },
})
export class DialogOrderTicketComponent {
  readonly #dialogRef = inject<DialogRef<OrderTicketDialogResult>>(DialogRef);
  readonly #facade = inject(TradingFacade);
  data = inject<OrderTicketDialogData>(DIALOG_DATA);

  context$ = this.#facade.orderTicketContext$(this.data.instrumentId);

  submit(order: OrderSpec): void {
    this.#dialogRef.close(order);
  }

  decline(): void {
    this.#dialogRef.close();
  }
}
