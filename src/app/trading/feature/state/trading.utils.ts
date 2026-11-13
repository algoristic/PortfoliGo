import { DepotId } from '@app/banking/domain/models/account.model';
import { AccountEntry } from '@app/banking/feature/state/banking.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { ExchangeInfo } from '@app/engine/data-access/service/engine-service.model';
import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import { OrderView, PositionView } from '@app/engine/domain/models/trading-view.model';
import { Instrument } from '@app/market/domain/models/instrument.model';
import { instrumentStatus } from '@app/market/feature/state/instrument-view.utils';
import { TaxYear } from '@app/taxes/domain/models/tax.model';
import { ORDER_HISTORY_LENGTH, OrderSide } from '@app/trading/domain/models/order.model';
import { isAtPriceFloor } from '@app/trading/domain/order-command-logic';
import { isActive } from '@app/trading/domain/order-reservation-logic';
import { OrderTicketContext } from '@app/trading/ui/models/order-ticket.model';
import { InstrumentTradeView } from '@app/trading/ui/models/trade-actions.model';

import { DepotEntry } from './trading.model';

/** Number of an order ID `ord-<n>`: the placement order (TS §7.5); unknown shapes count as 0. */
export function orderSequence(id: string): number {
  const match = /^ord-(\d+)$/.exec(id);
  return match === null ? 0 : Number(match[1]);
}

/** Active orders in placement order. */
export function compareByPlacement(a: OrderView, b: OrderView): number {
  return orderSequence(a.id) - orderSequence(b.id);
}

/** Closed orders newest first: by closing tick, within a tick the later placed first. */
export function compareNewestClosed(a: OrderView, b: OrderView): number {
  return (b.closedAt ?? 0) - (a.closedAt ?? 0) || orderSequence(b.id) - orderSequence(a.id);
}

/**
 * IDs of the closed orders beyond the newest `ORDER_HISTORY_LENGTH`, which the engine no longer
 * keeps either (TS §8.4): the UI trims its history the same way after every update.
 */
export function droppedHistoryIds(orders: readonly OrderView[]): string[] {
  const closed = orders.filter((order) => !isActive(order.status));
  if (closed.length <= ORDER_HISTORY_LENGTH) {
    return [];
  }
  return closed
    .sort(compareNewestClosed)
    .slice(ORDER_HISTORY_LENGTH)
    .map((order) => order.id);
}

/**
 * The player's depots (TS §7.3) from the clearing accounts in account order, with bank and
 * positions; closed ones included (`open` false).
 */
export function depotEntries(
  accounts: readonly AccountEntry[],
  holdings: Readonly<Record<string, PositionView[]>>,
): DepotEntry[] {
  return accounts.flatMap((account) =>
    account.kind !== 'clearing' || account.depot === null
      ? []
      : [
          {
            depotId: account.depot.id,
            number: account.depot.number,
            bank: account.bank,
            clearingAccount: account,
            open: account.closedAt === null,
            positions: holdings[account.depot.id] ?? [],
          },
        ],
  );
}

/** Shares of an instrument in the open depots and how many of them are free (US-HD-02). */
export function instrumentTradeView(
  instrument: Instrument,
  depots: readonly DepotEntry[],
): InstrumentTradeView {
  const open = depots.filter((depot) => depot.open);
  let quantity = 0;
  let free = 0;
  for (const depot of open) {
    const position = depot.positions.find((candidate) => candidate.instrumentId === instrument.id);
    quantity += position?.quantity ?? 0;
    free += position?.free ?? 0;
  }
  return {
    instrumentId: instrument.id,
    name: instrument.name,
    tradable: instrument.kind !== 'index',
    hasDepot: open.length > 0,
    quantity,
    free,
  };
}

/**
 * Live state of the order ticket (TS §11.8): the instrument with its quote and trading status,
 * the open depots whose bank is known with their clearing account and position, the tax year.
 */
export function orderTicketContext(
  instrument: Instrument,
  quote: SeriesQuote | null,
  depots: readonly DepotEntry[],
  exchanges: readonly ExchangeInfo[] | null,
  tick: Tick,
  taxYear: TaxYear | null,
  priceFloor: number,
): OrderTicketContext {
  const bid = quote?.bid ?? null;
  const ask = quote?.ask ?? null;
  return {
    instrument,
    quote: quote === null || bid === null || ask === null ? null : { last: quote.last, bid, ask },
    atPriceFloor: quote !== null && isAtPriceFloor(quote.last, priceFloor),
    marketOpen: instrumentStatus(instrument, exchanges, tick)?.open ?? null,
    tick,
    depots: depots.flatMap((depot) =>
      !depot.open || depot.bank === null
        ? []
        : [
            {
              depotId: depot.depotId,
              number: depot.number,
              bankName: depot.bank.name,
              conditions: depot.bank.conditions.depot,
              clearingBalance: depot.clearingAccount.balance,
              reserved: depot.clearingAccount.reserved,
              position:
                depot.positions.find((position) => position.instrumentId === instrument.id) ?? null,
            },
          ],
    ),
    taxYear,
  };
}

/**
 * Depot the order ticket starts with (US-HD-01, US-HD-02): the given one while it is open, for a
 * sale the first open depot with free shares of the instrument, else the first open depot.
 */
export function preselectedDepot(
  side: OrderSide,
  instrumentId: string,
  depots: readonly DepotEntry[],
  depotId?: DepotId,
): DepotId | null {
  const open = depots.filter((depot) => depot.open);
  const given = open.find((depot) => depot.depotId === depotId);
  const holding =
    side === 'sell'
      ? open.find((depot) =>
          depot.positions.some(
            (position) => position.instrumentId === instrumentId && position.free > 0,
          ),
        )
      : undefined;
  return (given ?? holding ?? open[0])?.depotId ?? null;
}
