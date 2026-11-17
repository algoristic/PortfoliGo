import { Component, computed, input, linkedSignal, output, untracked } from '@angular/core';
import { form, FormField, FormRoot } from '@angular/forms/signals';

import { dateTimeToTick } from '@app/clock/domain/calendar-logic';
import { toDateInputValue } from '@app/clock/domain/game-time-input';
import { TermHintComponent } from '@app/help/ui/term-hint/term-hint.component';
import { AmountInputComponent } from '@app/shared/ui/amount-input/amount-input.component';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { DialogComponent } from '@app/shared/ui/dialog/dialog.component';
import { InputDirective } from '@app/shared/ui/input/input.directive';
import { FormatCentsPipe } from '@app/shared/ui/pipes/format-cents/format-cents.pipe';
import { FormatPricePipe } from '@app/shared/ui/pipes/format-price/format-price.pipe';
import { FormatQuantityPipe } from '@app/shared/ui/pipes/format-quantity/format-quantity.pipe';
import { FormatSignedCentsPipe } from '@app/shared/ui/pipes/format-signed-cents/format-signed-cents.pipe';
import { SelectDirective } from '@app/shared/ui/select/select.directive';
import { formatQuantity } from '@app/shared/util/format';
import {
  ORDER_TYPES,
  ORDER_VALIDITY_KINDS,
  OrderSide,
  OrderSpec,
} from '@app/trading/domain/models/order.model';
import { venueQuote } from '@app/trading/domain/order-preview-logic';
import { latestValidityDate } from '@app/trading/domain/order-validity-logic';

import { orderTypeLabel, orderValidityLabel } from '../labels/order-labels';
import { OrderTicketContext, OrderTicketModel } from '../models/order-ticket.model';
import {
  hasLimit,
  hasStop,
  orderTicketDraft,
  orderTicketSchema,
  orderTicketSpec,
  ticketDepot,
} from '../schemas/order-ticket-schema';

/** What resets the ticket: the side and depot it was opened with. */
interface TicketStart {
  side: OrderSide;
  depotId: string;
}

/**
 * The order ticket's form (US-HD-01–03, TS §11.8) in the dialog frame: depot, side, quantity or
 * amount (amount only for purchases), order type with limit and stop, validity; below it the live
 * preview with the engine's functions: price with the bank's mark-up, market value, order fee,
 * third-party costs, total, reservation and free money with the shortfall, for sales the gain or
 * loss, the tax and the credit after taxes. Notes for a closed exchange, a negative clearing
 * account and the price floor. Emits the order; the feature layer places it.
 */
@Component({
  selector: 'app-form-order-ticket',
  imports: [
    SelectDirective,
    InputDirective,
    TermHintComponent,
    AmountInputComponent,
    ButtonDirective,
    DialogComponent,
    FormField,
    FormRoot,
    FormatCentsPipe,
    FormatPricePipe,
    FormatQuantityPipe,
    FormatSignedCentsPipe,
  ],
  templateUrl: './form-order-ticket.component.html',
  host: { class: 'block' },
})
export class FormOrderTicketComponent {
  context = input.required<OrderTicketContext>();
  /** The side the ticket opens with. */
  side = input<OrderSide>('buy');
  /** The depot the ticket opens with. */
  depotId = input('');

  typeOptions = ORDER_TYPES.map((type) => ({ type, label: orderTypeLabel(type) }));
  validityOptions = ORDER_VALIDITY_KINDS.map((kind) => ({ kind, label: orderValidityLabel(kind) }));

  submittedOrder = output<OrderSpec>();
  clickedCancel = output<void>();

  ticketModel = linkedSignal<TicketStart, OrderTicketModel>({
    source: () => ({ side: this.side(), depotId: this.depotId() }),
    computation: ({ side, depotId }) => ({
      depotId,
      side,
      sizeKind: 'quantity',
      quantity: '',
      amount: null,
      type: 'market',
      limit: '',
      stop: '',
      validity: 'day',
      validityDate: toDateInputValue(untracked(this.context).tick),
    }),
  });
  ticketForm = form(
    this.ticketModel,
    orderTicketSchema(() => this.context()),
    {
      submission: {
        action: async (field) => {
          const spec = orderTicketSpec(field().value(), this.context());
          if (spec !== null) {
            this.submittedOrder.emit(spec);
          }
        },
      },
    },
  );

  depotOptions = computed(() =>
    this.context().depots.map((depot) => ({
      id: depot.depotId,
      label: $localize`:@@uiTrading-formOrderTicket-depotOption:Depot ${depot.number}:number: · ${depot.bankName}:bank:`,
    })),
  );
  depot = computed(() => ticketDepot(this.ticketModel(), this.context()) ?? null);
  position = computed(() => this.depot()?.position ?? null);
  isBuy = computed(() => this.ticketModel().side === 'buy');
  byAmount = computed(() => this.isBuy() && this.ticketModel().sizeKind === 'amount');
  showLimit = computed(() => hasLimit(this.ticketModel()));
  showStop = computed(() => hasStop(this.ticketModel()));
  showDate = computed(() => this.ticketModel().validity === 'date');
  /** Bid and ask at the chosen depot's bank. */
  quote = computed(() => {
    const quote = this.context().quote;
    const depot = this.depot();
    return quote === null || depot === null
      ? null
      : venueQuote(quote, depot.conditions.spreadMarkup);
  });
  preview = computed(() => orderTicketDraft(this.ticketModel(), this.context())?.preview ?? null);
  /** The market or stop purchase reserves with the 5 % buffer (TS §7.5). */
  buffered = computed(() => this.preview()?.buffered ?? false);
  tax = computed(() => this.preview()?.tax ?? null);
  marketClosed = computed(() => this.context().marketOpen === false);
  clearingNegative = computed(() => this.isBuy() && (this.depot()?.clearingBalance ?? 0) < 0);
  atPriceFloor = computed(() => this.isBuy() && this.context().atPriceFloor);
  minDate = computed(() => toDateInputValue(this.context().tick));
  maxDate = computed(() =>
    toDateInputValue(dateTimeToTick(latestValidityDate(this.context().tick))),
  );
  heading = computed(() => {
    const name = this.context().instrument.name;
    return this.isBuy()
      ? $localize`:@@uiTrading-formOrderTicket-buyHeading:${name}:name: kaufen`
      : $localize`:@@uiTrading-formOrderTicket-sellHeading:${name}:name: verkaufen`;
  });

  /** Fills in all free shares of the position. */
  onSellAll(): void {
    const free = this.position()?.free ?? 0;
    if (free > 0) {
      this.ticketForm.quantity().value.set(formatQuantity(free));
    }
  }

  cancel(): void {
    this.clickedCancel.emit();
  }
}
