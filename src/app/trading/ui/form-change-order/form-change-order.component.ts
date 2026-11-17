import { Component, computed, input, linkedSignal, output, untracked } from '@angular/core';
import { form, FormField, FormRoot } from '@angular/forms/signals';

import { dateTimeToTick } from '@app/clock/domain/calendar-logic';
import { toDateInputValue } from '@app/clock/domain/game-time-input';
import { FormatGameTimePipe } from '@app/clock/ui/pipes/format-game-time/format-game-time.pipe';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { DialogComponent } from '@app/shared/ui/dialog/dialog.component';
import { InputDirective } from '@app/shared/ui/input/input.directive';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';
import { FormatQuantityPipe } from '@app/shared/ui/pipes/format-quantity/format-quantity.pipe';
import { SelectDirective } from '@app/shared/ui/select/select.directive';
import { ORDER_VALIDITY_KINDS, OrderChange } from '@app/trading/domain/models/order.model';
import { latestValidityDate } from '@app/trading/domain/order-validity-logic';

import { orderSideLabel, orderTypeLabel, orderValidityLabel } from '../labels/order-labels';
import { ChangeOrderContext, ChangeOrderModel } from '../models/change-order.model';
import {
  changedOrderReservation,
  changeOrderModel,
  changeOrderSchema,
  isEmptyChange,
  orderChangeOf,
} from '../schemas/change-order-schema';
import { hasLimit, hasStop } from '../schemas/order-ticket-schema';

/**
 * Changes an active order (US-HD-04): limit and stop for the order types that have them (the stop
 * of a triggered order is locked) and the validity, which then counts from the change. A purchase
 * shows its reservation before and after. Emits only the changed fields, nothing when nothing
 * changed; the feature layer sends the change and the engine checks it again.
 */
@Component({
  selector: 'app-form-change-order',
  imports: [
    SelectDirective,
    InputDirective,
    ButtonDirective,
    DialogComponent,
    FormField,
    FormRoot,
    FormatCentsPipe,
    FormatGameTimePipe,
    FormatQuantityPipe,
  ],
  templateUrl: './form-change-order.component.html',
  host: { class: 'block' },
})
export class FormChangeOrderComponent {
  context = input.required<ChangeOrderContext>();

  validityOptions = ORDER_VALIDITY_KINDS.map((kind) => ({ kind, label: orderValidityLabel(kind) }));

  submittedChange = output<OrderChange>();
  clickedCancel = output<void>();

  #orderId = computed(() => this.context().order.id);
  changeModel = linkedSignal<string, ChangeOrderModel>({
    source: this.#orderId,
    computation: () => {
      const { order, tick } = untracked(this.context);
      return changeOrderModel(order, tick);
    },
  });
  changeForm = form(
    this.changeModel,
    changeOrderSchema(() => this.context()),
    {
      submission: {
        action: async (field) => {
          const change = orderChangeOf(field().value(), this.context().order);
          if (change === null) {
            return;
          }
          if (isEmptyChange(change)) {
            this.clickedCancel.emit();
          } else {
            this.submittedChange.emit(change);
          }
        },
      },
    },
  );

  order = computed(() => this.context().order);
  isBuy = computed(() => this.order().side === 'buy');
  showLimit = computed(() => hasLimit(this.order()));
  showStop = computed(() => hasStop(this.order()));
  stopLocked = computed(() => this.order().status === 'triggered');
  showDate = computed(() => this.changeModel().validity === 'date');
  /** The order closed while the dialog was open. */
  inactive = computed(() => {
    const status = this.order().status;
    return status !== 'open' && status !== 'triggered';
  });
  newReservation = computed(() => changedOrderReservation(this.changeModel(), this.context()));
  minDate = computed(() => toDateInputValue(this.context().tick));
  maxDate = computed(() =>
    toDateInputValue(dateTimeToTick(latestValidityDate(this.context().tick))),
  );
  summary = computed(() => {
    const order = this.order();
    return `${orderSideLabel(order.side)} · ${orderTypeLabel(order.type)}`;
  });

  heading = $localize`:@@uiTrading-formChangeOrder-heading:Order ändern`;

  cancel(): void {
    this.clickedCancel.emit();
  }
}
