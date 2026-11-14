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
import { SavingsPlanView } from '@app/trading/domain/models/savings-plan.model';
import { isAtPriceFloor } from '@app/trading/domain/order-command-logic';
import { ExchangeQuote, venueQuote } from '@app/trading/domain/order-preview-logic';
import { isActive } from '@app/trading/domain/order-reservation-logic';
import { ChangeOrderContext } from '@app/trading/ui/models/change-order.model';
import { DepotReservation, OrderBookEntry } from '@app/trading/ui/models/order-book.model';
import { OrderTicketContext } from '@app/trading/ui/models/order-ticket.model';
import {
  SavingsPlanDepot,
  SavingsPlanEntry,
  SavingsPlanInstrument,
} from '@app/trading/ui/models/savings-plan.model';
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
    savingsPlanEligible: instrument.savingsPlanEligible,
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

/**
 * Orders of the order book (US-HD-04) with the instrument's name (its ID while the master data is
 * missing) and the depot's number and bank, in the given order.
 */
export function orderBookEntries(
  orders: readonly OrderView[],
  instruments: Readonly<Record<string, Instrument | undefined>>,
  depots: readonly DepotEntry[],
): OrderBookEntry[] {
  const byId = new Map(depots.map((depot) => [depot.depotId, depot] as const));
  return orders.map((order) => {
    const depot = byId.get(order.depotId);
    return {
      order,
      instrumentName: instruments[order.instrumentId]?.name ?? order.instrumentId,
      depotNumber: depot?.number ?? order.depotId,
      bankName: depot?.bank?.name ?? null,
    };
  });
}

/** Reserved money per clearing account (US-HD-04): the depots whose active buy orders reserve. */
export function depotReservations(depots: readonly DepotEntry[]): DepotReservation[] {
  return depots.flatMap((depot) =>
    depot.clearingAccount.reserved === 0
      ? []
      : [
          {
            depotId: depot.depotId,
            depotNumber: depot.number,
            bankName: depot.bank?.name ?? null,
            reserved: depot.clearingAccount.reserved,
            available: depot.clearingAccount.available,
          },
        ],
  );
}

/**
 * Live state of the dialog „Order ändern“ (US-HD-04): the order, the clearing account of its depot
 * and the ask at the depot's bank, which the engine uses for the new reservation of market and stop
 * purchases (`changedReservation`). `null` while the order or its depot is unknown.
 */
export function changeOrderContext(
  order: OrderView | undefined,
  instrument: Instrument | undefined,
  quote: SeriesQuote | null,
  depots: readonly DepotEntry[],
  tick: Tick,
): ChangeOrderContext | null {
  const depot = depots.find((candidate) => candidate.depotId === order?.depotId);
  if (order === undefined || depot === undefined) {
    return null;
  }
  const conditions = depot.bank?.conditions.depot ?? null;
  const ask =
    conditions === null || quote === null || quote.bid === null || quote.ask === null
      ? null
      : venueQuote({ last: quote.last, bid: quote.bid, ask: quote.ask }, conditions.spreadMarkup)
          .ask;
  return {
    order,
    instrumentName: instrument?.name ?? order.instrumentId,
    tick,
    conditions,
    clearingBalance: depot.clearingAccount.balance,
    reserved: depot.clearingAccount.reserved,
    ask,
  };
}

/** Number of a savings plan ID `sp-<n>`: the creation order (TS §7.8). */
export function savingsPlanSequence(id: string): number {
  const match = /^sp-(\d+)$/.exec(id);
  return match === null ? 0 : Number(match[1]);
}

/** Savings plans in creation order with instrument, depot and bank names (US-HD-05). */
export function savingsPlanEntries(
  plans: readonly SavingsPlanView[] | null,
  instruments: Readonly<Record<string, Instrument | undefined>>,
  depots: readonly DepotEntry[],
): SavingsPlanEntry[] | null {
  if (plans === null) {
    return null;
  }
  const byId = new Map(depots.map((depot) => [depot.depotId, depot] as const));
  return [...plans]
    .sort((a, b) => savingsPlanSequence(a.id) - savingsPlanSequence(b.id))
    .map((plan) => {
      const depot = byId.get(plan.depotId);
      return {
        plan,
        instrumentName: instruments[plan.instrumentId]?.name ?? plan.instrumentId,
        depotNumber: depot?.number ?? plan.depotId,
        bankName: depot?.bank?.name ?? null,
      };
    });
}

/**
 * The next executions of the active savings plans, earliest first (ties in creation order); for the
 * „Demnächst“ widget of AP 5.7 (TS §8.1: planned dates only, no amounts that depend on prices).
 */
export function upcomingSavingsPlans(
  entries: readonly SavingsPlanEntry[] | null,
): SavingsPlanEntry[] {
  return (entries ?? [])
    .filter(({ plan }) => plan.nextExecution !== null)
    .sort(
      (a, b) =>
        (a.plan.nextExecution ?? 0) - (b.plan.nextExecution ?? 0) ||
        savingsPlanSequence(a.plan.id) - savingsPlanSequence(b.plan.id),
    );
}

/** Savings-plan-eligible instruments for the dialog: ETFs, then shares, each by name (`de`). */
export function savingsPlanInstruments(
  instruments: Readonly<Record<string, Instrument | undefined>>,
): SavingsPlanInstrument[] {
  const collator = new Intl.Collator('de');
  return Object.values(instruments)
    .filter((instrument): instrument is Instrument => instrument?.savingsPlanEligible === true)
    .sort(
      (a, b) =>
        Number(a.kind !== 'etf') - Number(b.kind !== 'etf') ||
        collator.compare(a.name, b.name) ||
        a.id.localeCompare(b.id),
    )
    .map(({ id, name, kind }) => ({ id, name, kind }));
}

/** The open depots of the savings plan dialog with costs, mark-up and clearing account. */
export function savingsPlanDepots(depots: readonly DepotEntry[]): SavingsPlanDepot[] {
  return depots.flatMap((depot) =>
    !depot.open || depot.bank === null
      ? []
      : [
          {
            depotId: depot.depotId,
            number: depot.number,
            bankName: depot.bank.name,
            savingsPlanFee: depot.bank.conditions.depot.savingsPlanFee,
            spreadMarkup: depot.bank.conditions.depot.spreadMarkup,
            clearingBalance: depot.clearingAccount.balance,
            reserved: depot.clearingAccount.reserved,
          },
        ],
  );
}

/** Last quote of an instrument without a venue mark-up; `null` without bid and ask. */
export function exchangeQuote(quote: SeriesQuote | null | undefined): ExchangeQuote | null {
  return quote === null || quote === undefined || quote.bid === null || quote.ask === null
    ? null
    : { last: quote.last, bid: quote.bid, ask: quote.ask };
}

/**
 * Depot the savings plan dialog starts with: the given one while it is open, else the first open
 * depot; `null` without one.
 */
export function savingsPlanDepot(depots: readonly DepotEntry[], depotId?: DepotId): DepotId | null {
  const open = depots.filter((depot) => depot.open);
  return (open.find((depot) => depot.depotId === depotId) ?? open[0])?.depotId ?? null;
}
