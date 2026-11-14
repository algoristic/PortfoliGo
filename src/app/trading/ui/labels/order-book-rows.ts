import { BadgeTone } from '@app/shared/ui/badge/badge.model';
import { OrderStatus } from '@app/trading/domain/models/order.model';

import {
  orderCommandErrorLabel,
  orderSideLabel,
  orderStatusLabel,
  orderTypeLabel,
} from './order-labels';

import { ClosedOrderRow, OpenOrderRow, OrderRow } from '../models/order-book-rows.model';
import { OrderBookEntry } from '../models/order-book.model';

const STATUS_TONES: Record<OrderStatus, BadgeTone> = {
  open: 'accent',
  triggered: 'warning',
  executed: 'up',
  cancelled: 'neutral',
  expired: 'neutral',
  rejected: 'down',
};

/** The texts an order shows in both lists of the order book (US-HD-04). */
export function orderRow({
  order,
  instrumentName,
  depotNumber,
  bankName,
}: OrderBookEntry): OrderRow {
  return {
    id: order.id,
    instrumentId: order.instrumentId,
    instrumentName,
    depotLabel:
      bankName === null
        ? $localize`:@@uiTrading-orderBookRows-depot:Depot ${depotNumber}:number:`
        : $localize`:@@uiTrading-orderBookRows-depotAtBank:Depot ${depotNumber}:number: · ${bankName}:bank:`,
    sideLabel: orderSideLabel(order.side),
    sideTone: order.side === 'buy' ? 'up' : 'down',
    statusLabel: orderStatusLabel(order.status),
    statusTone: STATUS_TONES[order.status],
    typeLabel: orderTypeLabel(order.type),
    limit: order.limit,
    stop: order.stop,
    priceNamed: order.type === 'limit' || order.type === 'stop',
    quantity: order.size.kind === 'quantity' ? order.size.quantity : null,
    amount: order.size.kind === 'amount' ? order.size.amount : null,
  };
}

export function openOrderRow(entry: OrderBookEntry): OpenOrderRow {
  const name = entry.instrumentName;
  return {
    ...orderRow(entry),
    expiresAt: entry.order.expiresAt,
    reserved: entry.order.side === 'buy' ? entry.order.reserved : null,
    changeLabel: $localize`:@@uiTrading-orderBookRows-change:Order für ${name}:instrument: ändern`,
    cancelLabel: $localize`:@@uiTrading-orderBookRows-cancel:Order für ${name}:instrument: stornieren`,
  };
}

export function closedOrderRow(entry: OrderBookEntry): ClosedOrderRow {
  const { execution, rejection, closedAt } = entry.order;
  return {
    ...orderRow(entry),
    closedAt,
    execution:
      execution === null
        ? null
        : {
            tick: execution.tick,
            quantity: execution.quantity,
            price: execution.price,
            costs: execution.orderFee + execution.exchangeFee,
            total: execution.total,
          },
    rejectionLabel: rejection === null ? null : orderCommandErrorLabel(rejection, null),
  };
}
