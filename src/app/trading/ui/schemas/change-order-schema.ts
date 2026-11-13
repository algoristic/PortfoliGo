import { disabled, schema, Schema, validate, ValidationError } from '@angular/forms/signals';

import { dateTimeToTick } from '@app/clock/domain/calendar-logic';
import { toDateInputValue } from '@app/clock/domain/game-time-input';
import { OrderView } from '@app/engine/domain/models/trading-view.model';
import { Cents } from '@app/shared/domain/models/money.model';
import {
  OrderChange,
  OrderCommandError,
  OrderValidity,
} from '@app/trading/domain/models/order.model';
import { changedReservation, orderChangeError } from '@app/trading/domain/order-command-logic';
import { formatPriceInput, parsePriceInput } from '@app/trading/domain/order-input-logic';
import { isActive } from '@app/trading/domain/order-reservation-logic';

import { hasLimit, hasStop, orderTicketValidity } from './order-ticket-schema';

import { orderCommandErrorLabel } from '../labels/order-labels';
import { ChangeOrderContext, ChangeOrderModel } from '../models/change-order.model';

/** Fields of a change the engine's codes belong to. */
type ChangeField = keyof Pick<ChangeOrderModel, 'limit' | 'stop' | 'validityDate'>;

/**
 * The controls of a change start with the order's values (US-HD-04); a date field without a date
 * validity starts at the current day.
 */
export function changeOrderModel(order: OrderView, tick: number): ChangeOrderModel {
  return {
    limit: order.limit === null ? '' : formatPriceInput(order.limit),
    stop: order.stop === null ? '' : formatPriceInput(order.stop),
    validity: order.validity.kind,
    validityDate:
      order.validity.kind === 'date'
        ? toDateInputValue(dateTimeToTick(order.validity.date))
        : toDateInputValue(tick),
  };
}

/**
 * The change the controls describe, with only the fields that differ from the order (US-HD-04):
 * limit and stop for the order types that have them, the validity when its kind or date changed.
 * `null` while a field is empty or unreadable.
 */
export function orderChangeOf(model: ChangeOrderModel, order: OrderView): OrderChange | null {
  const limit = hasLimit(order) ? parsePriceInput(model.limit) : null;
  const stop = hasStop(order) ? parsePriceInput(model.stop) : null;
  const validity = orderTicketValidity(model);
  if (limit?.kind === 'empty' || limit?.kind === 'invalid') {
    return null;
  }
  if (stop?.kind === 'empty' || stop?.kind === 'invalid' || validity === null) {
    return null;
  }
  const change: OrderChange = {};
  if (limit !== null && limit.value !== order.limit) {
    change.limit = limit.value;
  }
  if (stop !== null && stop.value !== order.stop) {
    change.stop = stop.value;
  }
  if (!sameValidity(validity, order.validity)) {
    change.validity = validity;
  }
  return change;
}

/** Whether a change changes anything. */
export function isEmptyChange(change: OrderChange): boolean {
  return change.limit === undefined && change.stop === undefined && change.validity === undefined;
}

/**
 * Reservation of a buy order after the change (`changedReservation`, TS §7.5); `null` for sales,
 * without the bank's conditions or without a readable change. Without a quote the market and stop
 * purchases are estimated at their stop (the engine estimates at the higher of ask and stop).
 */
export function changedOrderReservation(
  model: ChangeOrderModel,
  context: ChangeOrderContext,
): Cents | null {
  const change = orderChangeOf(model, context.order);
  if (change === null || context.conditions === null || context.order.side === 'sell') {
    return null;
  }
  return changedReservation(context.order, change, context.ask ?? 0, context.conditions);
}

/**
 * The dialog „Order ändern“ (US-HD-04): readable limit and stop for the order types that have them,
 * a validity date; then the engine's own check of the change (`orderChangeError`) with its message on
 * the field it concerns, a growing reservation against the free money included. The stop of a
 * triggered order is locked; an order that closed meanwhile cannot be changed. The engine checks the
 * command again.
 */
export function changeOrderSchema(context: () => ChangeOrderContext): Schema<ChangeOrderModel> {
  return schema<ChangeOrderModel>((path) => {
    validate(path, () =>
      isActive(context().order.status)
        ? null
        : { kind: 'order-not-active', message: orderCommandErrorLabel('order-not-active', null) },
    );
    disabled(path.stop, () => context().order.status === 'triggered');
    validate(path.limit, ({ value, valueOf }) =>
      hasLimit(context().order)
        ? (priceInputError(value(), 'limit') ?? engineError(valueOf(path), 'limit', context()))
        : null,
    );
    validate(path.stop, ({ value, valueOf }) =>
      hasStop(context().order)
        ? (priceInputError(value(), 'stop') ?? engineError(valueOf(path), 'stop', context()))
        : null,
    );
    validate(path.validityDate, ({ valueOf }) => {
      if (valueOf(path.validity) !== 'date') {
        return null;
      }
      return orderTicketValidity(valueOf(path)) === null
        ? {
            kind: 'required',
            message: $localize`:@@uiTrading-changeOrderSchema-dateRequired:Bitte wähle ein Datum.`,
          }
        : engineError(valueOf(path), 'validityDate', context());
    });
  });
}

/** The field of a change an engine code belongs to (TS §7.5 „Ändern“). */
export function changeFieldOf(code: OrderCommandError, order: OrderView): ChangeField | null {
  switch (code) {
    case 'invalid-limit':
      return 'limit';
    case 'invalid-stop':
    case 'stop-triggered':
      return 'stop';
    case 'invalid-validity':
    case 'validity-too-long':
      return 'validityDate';
    case 'insufficient-funds':
      return hasLimit(order) ? 'limit' : 'stop';
    default:
      return null;
  }
}

// The engine's verdict on the change, shown on the field the code concerns. Without a quote the
// stop purchase is estimated at its stop; the engine estimates at the higher of ask and stop.
function engineError(
  model: ChangeOrderModel,
  field: ChangeField,
  context: ChangeOrderContext,
): ValidationError | null {
  const change = orderChangeOf(model, context.order);
  if (change === null || context.conditions === null || isEmptyChange(change)) {
    return null;
  }
  const code = orderChangeError(context.order, change, {
    tick: context.tick,
    conditions: context.conditions,
    ask: context.ask ?? 0,
    clearingBalance: context.clearingBalance,
    reserved: context.reserved,
  });
  if (code === null || changeFieldOf(code, context.order) !== field) {
    return null;
  }
  return { kind: code, message: orderCommandErrorLabel(code, null) };
}

function priceInputError(text: string, field: 'limit' | 'stop'): ValidationError | null {
  const price = parsePriceInput(text);
  if (price.kind === 'value') {
    const code = field === 'limit' ? 'invalid-limit' : 'invalid-stop';
    return price.value > 0 ? null : { kind: code, message: orderCommandErrorLabel(code, null) };
  }
  if (field === 'limit') {
    return price.kind === 'empty'
      ? {
          kind: 'required',
          message: $localize`:@@uiTrading-changeOrderSchema-limitRequired:Bitte gib ein Limit ein.`,
        }
      : {
          kind: 'price',
          message: $localize`:@@uiTrading-changeOrderSchema-limitInvalid:Bitte gib ein Limit ein, z. B. 99,50.`,
        };
  }
  return price.kind === 'empty'
    ? {
        kind: 'required',
        message: $localize`:@@uiTrading-changeOrderSchema-stopRequired:Bitte gib einen Stop-Kurs ein.`,
      }
    : {
        kind: 'price',
        message: $localize`:@@uiTrading-changeOrderSchema-stopInvalid:Bitte gib einen Stop-Kurs ein, z. B. 95,00.`,
      };
}

function sameValidity(a: OrderValidity, b: OrderValidity): boolean {
  if (a.kind !== 'date' || b.kind !== 'date') {
    return a.kind === b.kind;
  }
  return a.date.year === b.date.year && a.date.month === b.date.month && a.date.day === b.date.day;
}
