import { DepotId } from '@app/banking/domain/models/account.model';
import { Order } from '@app/trading/domain/models/order.model';

import { costPerShare } from './lot-logic';
import {
  DepotPosition,
  DetailLot,
  PositionDetail,
  PositionTrade,
} from './models/position-detail.model';
import { positionOverview } from './position-overview-logic';

/**
 * The position of an instrument in the shown depots (US-PF-06): the head figures as in the depot
 * overview (TS §7.9; all depots combined), the realized gain and the distributions summed over
 * the depots, and the lots of every depot ordered by purchase time (ties in depot order), each
 * with its cost per share. `null` when no shown depot holds shares.
 */
export function positionDetail(
  parts: readonly DepotPosition[],
  name: string,
  bid: number | null,
): PositionDetail | null {
  const held = parts.filter((part) => part.quantity > 0);
  if (held.length === 0) {
    return null;
  }
  const quantity = held.reduce((sum, part) => sum + part.quantity, 0);
  const cost = held.reduce((sum, part) => sum + part.cost, 0);
  const instrumentId = held[0].instrumentId;
  const {
    rows: [figures],
  } = positionOverview([{ instrumentId, name, quantity, cost, bid }]);
  const lots = held
    .flatMap((part) =>
      part.lots.map((lot): DetailLot => ({
        ...lot,
        depotId: part.depotId,
        costPerShare: costPerShare(lot.cost, lot.quantity),
      })),
    )
    .sort((a, b) => a.buyTick - b.buyTick);
  return {
    instrumentId,
    quantity,
    cost,
    averageCost: figures.averageCost,
    price: figures.price,
    value: figures.value,
    gain: figures.gain,
    gainRatio: figures.gainRatio,
    realizedGain: held.reduce((sum, part) => sum + part.realizedGain, 0),
    distributions: held.reduce((sum, part) => sum + part.distributions, 0),
    lots,
  };
}

/**
 * Executed purchases and sales of an instrument in the shown depots (`null` = all), newest first
 * (ties by order ID descending): what the order history still keeps (TS §7.5,
 * `ORDER_HISTORY_LENGTH`). Costs are the order and the exchange fee.
 */
export function positionTrades(
  orders: readonly Order[],
  instrumentId: string,
  depotIds: readonly DepotId[] | null,
): PositionTrade[] {
  const shown = depotIds === null ? null : new Set(depotIds);
  return orders
    .flatMap((order): PositionTrade[] => {
      const { execution } = order;
      if (
        execution === null ||
        order.status !== 'executed' ||
        order.instrumentId !== instrumentId ||
        (shown !== null && !shown.has(order.depotId))
      ) {
        return [];
      }
      return [
        {
          orderId: order.id,
          depotId: order.depotId,
          side: order.side,
          tick: execution.tick,
          quantity: execution.quantity,
          price: execution.price,
          costs: execution.orderFee + execution.exchangeFee,
          total: execution.total,
        },
      ];
    })
    .sort((a, b) => b.tick - a.tick || orderNumber(b.orderId) - orderNumber(a.orderId));
}

/** The sequence number of an order ID `ord-<n>`; 0 for other IDs. */
function orderNumber(orderId: string): number {
  const number = Number(orderId.slice(orderId.indexOf('-') + 1));
  return Number.isSafeInteger(number) ? number : 0;
}
