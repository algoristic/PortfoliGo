import { schema, Schema, validate, ValidationError } from '@angular/forms/signals';

import { tickToDateTime } from '@app/clock/domain/calendar-logic';
import { parseDateTimeInput } from '@app/clock/domain/game-time-input';
import {
  OrderCommandError,
  OrderSpec,
  OrderValidity,
} from '@app/trading/domain/models/order.model';
import { parsePriceInput, parseQuantityInput } from '@app/trading/domain/order-input-logic';
import { orderPreview, OrderPreview, venueQuote } from '@app/trading/domain/order-preview-logic';

import { orderCommandErrorLabel } from '../labels/order-labels';
import {
  OrderTicketContext,
  OrderTicketDepot,
  OrderTicketModel,
} from '../models/order-ticket.model';

/** The order the ticket describes, its preview and the depot it uses. */
export interface OrderTicketDraft {
  spec: OrderSpec;
  depot: OrderTicketDepot;
  preview: OrderPreview | null;
}

/** Fields of the ticket the engine's codes belong to. */
type TicketField = keyof Pick<
  OrderTicketModel,
  'depotId' | 'side' | 'quantity' | 'amount' | 'limit' | 'stop' | 'validityDate'
>;

/** The chosen depot among the open ones; `undefined` without one. */
export function ticketDepot(
  model: Pick<OrderTicketModel, 'depotId'>,
  context: OrderTicketContext,
): OrderTicketDepot | undefined {
  return context.depots.find((depot) => depot.depotId === model.depotId);
}

/**
 * The order of the ticket's values (TS §11.8), or `null` while a depot is missing or a field the
 * order needs is empty or unreadable. Sales are always by quantity; limit and stop only for the
 * order types that have them.
 */
export function orderTicketSpec(
  model: OrderTicketModel,
  context: OrderTicketContext,
): OrderSpec | null {
  const depot = ticketDepot(model, context);
  if (depot === undefined) {
    return null;
  }
  const byAmount = model.side === 'buy' && model.sizeKind === 'amount';
  const quantity = parseQuantityInput(model.quantity);
  if (byAmount ? model.amount === null : quantity.kind !== 'value') {
    return null;
  }
  const limit = hasLimit(model) ? parsePriceInput(model.limit) : null;
  const stop = hasStop(model) ? parsePriceInput(model.stop) : null;
  const validity = orderTicketValidity(model);
  if (limit?.kind === 'empty' || limit?.kind === 'invalid') {
    return null;
  }
  if (stop?.kind === 'empty' || stop?.kind === 'invalid' || validity === null) {
    return null;
  }
  return {
    depotId: depot.depotId,
    instrumentId: context.instrument.id,
    side: model.side,
    type: model.type,
    size:
      byAmount && model.amount !== null
        ? { kind: 'amount', amount: model.amount }
        : { kind: 'quantity', quantity: quantity.kind === 'value' ? quantity.value : 0 },
    limit: limit?.value ?? null,
    stop: stop?.value ?? null,
    validity,
  };
}

/** The order with its live preview (`ticketPreview`). */
export function orderTicketDraft(
  model: OrderTicketModel,
  context: OrderTicketContext,
): OrderTicketDraft | null {
  const spec = orderTicketSpec(model, context);
  const depot = ticketDepot(model, context);
  if (spec === null || depot === undefined) {
    return null;
  }
  return { spec, depot, preview: ticketPreview(spec, depot, context) };
}

/**
 * Preview of an order in a depot (`orderPreview` with the depot bank's quote, TS §11.8); `null`
 * without a quote (indices, before the first quote) or with prices or an amount that cannot be
 * estimated.
 */
export function ticketPreview(
  spec: OrderSpec,
  depot: OrderTicketDepot,
  context: Pick<OrderTicketContext, 'quote' | 'tick' | 'atPriceFloor' | 'taxYear'>,
): OrderPreview | null {
  if (
    context.quote === null ||
    !isPositive(spec.limit ?? 1) ||
    !isPositive(spec.stop ?? 1) ||
    (spec.size.kind === 'amount' && spec.size.amount <= 0)
  ) {
    return null;
  }
  const position = depot.position;
  return orderPreview(spec, {
    tick: context.tick,
    conditions: depot.conditions,
    quote: venueQuote(context.quote, depot.conditions.spreadMarkup),
    atPriceFloor: context.atPriceFloor,
    clearingBalance: depot.clearingBalance,
    reserved: depot.reserved,
    freeQuantity: position?.free ?? 0,
    lots: position?.lots ?? [],
    taxYear: context.taxYear,
  });
}

/**
 * The order ticket (US-HD-01–03, TS §11.8): a depot, a readable quantity or amount, limit and stop
 * for the types that have them, a validity date; then the engine's own check of the whole order
 * (`orderPlacementError` in `orderPreview`) with its message on the field it concerns, including
 * the shortfall of a purchase. The engine checks the command again.
 */
export function orderTicketSchema(context: () => OrderTicketContext): Schema<OrderTicketModel> {
  return schema<OrderTicketModel>((path) => {
    validate(path.depotId, ({ value, valueOf }) =>
      context().depots.some((depot) => depot.depotId === value())
        ? engineError(valueOf(path), 'depotId', context())
        : {
            kind: 'required',
            message: $localize`:@@uiTrading-orderTicketSchema-depotRequired:Bitte wähle ein Depot.`,
          },
    );
    validate(path.side, ({ valueOf }) => engineError(valueOf(path), 'side', context()));
    validate(path.quantity, ({ value, valueOf }) => {
      if (valueOf(path.side) === 'buy' && valueOf(path.sizeKind) === 'amount') {
        return null;
      }
      const quantity = parseQuantityInput(value());
      switch (quantity.kind) {
        case 'empty':
          return {
            kind: 'required',
            message: $localize`:@@uiTrading-orderTicketSchema-quantityRequired:Bitte gib die Stückzahl ein.`,
          };
        case 'invalid':
          return {
            kind: 'quantity',
            message: $localize`:@@uiTrading-orderTicketSchema-quantityInvalid:Bitte gib eine Stückzahl ein, z. B. 10 oder 0,5.`,
          };
        default:
          return engineError(valueOf(path), 'quantity', context());
      }
    });
    validate(path.amount, ({ value, valueOf }) => {
      if (valueOf(path.side) !== 'buy' || valueOf(path.sizeKind) !== 'amount') {
        return null;
      }
      return value() === null
        ? {
            kind: 'required',
            message: $localize`:@@uiTrading-orderTicketSchema-amountRequired:Bitte gib einen Betrag ein.`,
          }
        : engineError(valueOf(path), 'amount', context());
    });
    validate(path.limit, ({ value, valueOf }) =>
      hasLimit({ type: valueOf(path.type) })
        ? (priceInputError(value(), 'limit') ?? engineError(valueOf(path), 'limit', context()))
        : null,
    );
    validate(path.stop, ({ value, valueOf }) =>
      hasStop({ type: valueOf(path.type) })
        ? (priceInputError(value(), 'stop') ?? engineError(valueOf(path), 'stop', context()))
        : null,
    );
    validate(path.validityDate, ({ value, valueOf }) => {
      if (valueOf(path.validity) !== 'date') {
        return null;
      }
      return parseDateTimeInput(value(), '') === null
        ? {
            kind: 'required',
            message: $localize`:@@uiTrading-orderTicketSchema-dateRequired:Bitte wähle ein Datum.`,
          }
        : engineError(valueOf(path), 'validityDate', context());
    });
  });
}

/** The validity of the ticket; `null` for the validity `date` without a readable date. */
export function orderTicketValidity(
  model: Pick<OrderTicketModel, 'validity' | 'validityDate'>,
): OrderValidity | null {
  if (model.validity !== 'date') {
    return { kind: model.validity };
  }
  const tick = parseDateTimeInput(model.validityDate, '');
  if (tick === null) {
    return null;
  }
  const { year, month, day } = tickToDateTime(tick);
  return { kind: 'date', date: { year, month, day } };
}

export function hasLimit(model: Pick<OrderTicketModel, 'type'>): boolean {
  return model.type === 'limit' || model.type === 'stop-limit';
}

export function hasStop(model: Pick<OrderTicketModel, 'type'>): boolean {
  return model.type === 'stop' || model.type === 'stop-limit';
}

// The engine's verdict on the whole order, shown on the field the code concerns.
function engineError(
  model: OrderTicketModel,
  field: TicketField,
  context: OrderTicketContext,
): ValidationError | null {
  const preview = orderTicketDraft(model, context)?.preview ?? null;
  if (preview === null || preview.error === null || ticketFieldOf(preview.error, model) !== field) {
    return null;
  }
  return {
    kind: preview.error,
    message: orderCommandErrorLabel(preview.error, preview.shortfall),
  };
}

function priceInputError(text: string, field: 'limit' | 'stop'): ValidationError | null {
  const price = parsePriceInput(text);
  if (price.kind === 'value') {
    // Without a positive price there is nothing to estimate; the engine's code names the rule.
    const code = field === 'limit' ? 'invalid-limit' : 'invalid-stop';
    return price.value > 0 ? null : { kind: code, message: orderCommandErrorLabel(code, null) };
  }
  if (field === 'limit') {
    return price.kind === 'empty'
      ? {
          kind: 'required',
          message: $localize`:@@uiTrading-orderTicketSchema-limitRequired:Bitte gib ein Limit ein.`,
        }
      : {
          kind: 'price',
          message: $localize`:@@uiTrading-orderTicketSchema-limitInvalid:Bitte gib ein Limit ein, z. B. 99,50.`,
        };
  }
  return price.kind === 'empty'
    ? {
        kind: 'required',
        message: $localize`:@@uiTrading-orderTicketSchema-stopRequired:Bitte gib einen Stop-Kurs ein.`,
      }
    : {
        kind: 'price',
        message: $localize`:@@uiTrading-orderTicketSchema-stopInvalid:Bitte gib einen Stop-Kurs ein, z. B. 95,00.`,
      };
}

function isPositive(price: number): boolean {
  return Number.isFinite(price) && price > 0;
}

/** The field of the ticket an engine code belongs to (TS §7.5 „Erteilen“). */
export function ticketFieldOf(code: OrderCommandError, model: OrderTicketModel): TicketField {
  switch (code) {
    case 'invalid-quantity':
    case 'fractional-not-allowed':
    case 'insufficient-quantity':
      return 'quantity';
    case 'invalid-amount':
      return 'amount';
    case 'insufficient-funds':
      return model.sizeKind === 'amount' ? 'amount' : 'quantity';
    case 'invalid-limit':
      return 'limit';
    case 'invalid-stop':
      return 'stop';
    case 'invalid-validity':
    case 'validity-too-long':
      return 'validityDate';
    case 'price-floor':
    case 'clearing-account-negative':
    case 'instrument-not-tradable':
    case 'amount-only-for-buy':
      return 'side';
    default:
      return 'depotId';
  }
}
