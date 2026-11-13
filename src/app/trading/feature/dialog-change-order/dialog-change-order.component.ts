import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { OrderChange } from '@app/trading/domain/models/order.model';
import { FormChangeOrderComponent } from '@app/trading/ui/form-change-order/form-change-order.component';

import { ChangeOrderDialogData, ChangeOrderDialogResult } from './dialog-change-order.model';

import { TradingFacade } from '../state/trading.facade';

/**
 * „Order ändern“ (US-HD-04): the form follows the order, the quote and the clearing account of the
 * store while it is open. `TradingDialogEffects` opens it and sends the change.
 */
@Component({
  selector: 'app-dialog-change-order',
  imports: [CommonModule, FormChangeOrderComponent],
  templateUrl: './dialog-change-order.component.html',
  host: { class: 'block' },
})
export class DialogChangeOrderComponent {
  readonly #dialogRef = inject<DialogRef<ChangeOrderDialogResult>>(DialogRef);
  readonly #facade = inject(TradingFacade);
  data = inject<ChangeOrderDialogData>(DIALOG_DATA);

  context$ = this.#facade.changeOrderContext$(this.data.orderId);

  submit(change: OrderChange): void {
    this.#dialogRef.close(change);
  }

  decline(): void {
    this.#dialogRef.close();
  }
}
