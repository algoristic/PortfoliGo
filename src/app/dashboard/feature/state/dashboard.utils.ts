import { Dictionary } from '@ngrx/entity';

import { AccountId } from '@app/banking/domain/models/account.model';
import { StandingOrderView } from '@app/banking/domain/models/standing-order.model';
import { AccountEntry } from '@app/banking/feature/state/banking.model';
import { Tick } from '@app/clock/domain/models/time.model';
import {
  FirstStepsFacts,
  FirstStepsSettings,
} from '@app/dashboard/domain/models/first-steps.model';
import { UpcomingEvent } from '@app/dashboard/domain/models/upcoming.model';
import { topPositions } from '@app/dashboard/domain/top-positions-logic';
import { isInWindow, sortUpcoming, upcomingEnd } from '@app/dashboard/domain/upcoming-logic';
import { UpcomingResult } from '@app/engine/data-access/service/engine-service.model';
import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import { OrderView } from '@app/engine/domain/models/trading-view.model';
import { Instrument } from '@app/market/domain/models/instrument.model';
import { SavingsPlanView } from '@app/trading/domain/models/savings-plan.model';
import { isActive } from '@app/trading/domain/order-reservation-logic';
import { DepotEntry } from '@app/trading/feature/state/trading.model';

import { DEFAULT_FIRST_STEPS, StoredFirstSteps } from './dashboard.model';

import {
  TopPositionEntry,
  UpcomingEntry,
  WatchlistSummary,
} from '../../ui/models/dashboard-view.model';

/** Names of accounts and instruments by ID, as the notification texts use them. */
type Names = ReadonlyMap<string, string>;

/**
 * Reads `pgo.ui.firstSteps` (TS §9.3): an object of player IDs; an entry whose fields are not both
 * booleans is dropped, so the player starts with the defaults.
 */
export function parseStoredFirstSteps(data: unknown): StoredFirstSteps {
  const result: StoredFirstSteps = {};
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return result;
  }
  for (const [playerId, entry] of Object.entries(data)) {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as Record<string, unknown>)['hidden'] === 'boolean' &&
      typeof (entry as Record<string, unknown>)['banksVisited'] === 'boolean'
    ) {
      const { hidden, banksVisited } = entry as FirstStepsSettings;
      result[playerId] = { hidden, banksVisited };
    }
  }
  return result;
}

/** The settings of one player, the defaults when there are none. */
export function firstStepsOf(stored: StoredFirstSteps, playerId: string): FirstStepsSettings {
  return stored[playerId] ?? DEFAULT_FIRST_STEPS;
}

/** What the slices tell about the progress of „Erste Schritte“ (US-UI-10). */
export function firstStepsFacts(
  banksVisited: boolean,
  accounts: readonly AccountEntry[],
  depots: readonly DepotEntry[],
  orders: readonly OrderView[],
  savingsPlans: readonly SavingsPlanView[] | null,
): FirstStepsFacts {
  return {
    banksVisited,
    depots: accounts.filter((account) => account.kind === 'clearing').length,
    clearingBalances: accounts
      .filter((account) => account.kind === 'clearing')
      .map((account) => account.balance),
    positions: depots.reduce((sum, depot) => sum + depot.positions.length, 0),
    executedOrders: orders.filter((order) => order.status === 'executed').length,
    savingsPlans: savingsPlans?.length ?? 0,
  };
}

/**
 * „Demnächst“ (TS §8.1, E-05): the worker's dates of the last query plus the next executions of
 * standing orders and savings plans and the expiry of active orders from the projections, all
 * after `now` and up to the end of the queried window, sorted; `null` before the first query.
 */
export function upcomingEntries(
  result: UpcomingResult | null,
  now: Tick | null,
  standingOrders: readonly StandingOrderView[] | null,
  savingsPlans: readonly SavingsPlanView[] | null,
  orders: readonly OrderView[],
  accountNames: Names,
  instrumentNames: Names,
): UpcomingEntry[] | null {
  if (result === null) {
    return null;
  }
  const from = Math.max(now ?? result.tick, result.tick);
  const end = upcomingEnd(result.tick, result.days);
  const planned: UpcomingEvent[] = [
    ...(standingOrders ?? []).flatMap((order): UpcomingEvent[] =>
      order.nextExecution === null
        ? []
        : [
            {
              kind: 'standing-order',
              tick: order.nextExecution,
              amount: order.amount,
              accountId: order.fromAccountId,
              toAccountId: order.toAccountId,
              sourceId: order.id,
            },
          ],
    ),
    ...(savingsPlans ?? []).flatMap((plan): UpcomingEvent[] =>
      plan.nextExecution === null
        ? []
        : [
            {
              kind: 'savings-plan',
              tick: plan.nextExecution,
              amount: plan.amount,
              depotId: plan.depotId,
              instrumentId: plan.instrumentId,
              sourceId: plan.id,
            },
          ],
    ),
    ...orders
      .filter((order) => isActive(order.status))
      .map((order): UpcomingEvent => ({
        kind: 'order-expiry',
        tick: order.expiresAt,
        amount: null,
        depotId: order.depotId,
        instrumentId: order.instrumentId,
        sourceId: order.id,
      })),
  ];
  const nameOf = (names: Names, id: string | undefined): string | null =>
    id === undefined ? null : (names.get(id) ?? id);
  return sortUpcoming([...result.events, ...planned])
    .filter((event) => isInWindow(event.tick, from, end))
    .map((event, index) => ({
      key: `${event.kind}:${event.tick}:${event.sourceId ?? event.accountId ?? event.instrumentId ?? ''}:${index}`,
      kind: event.kind,
      tick: event.tick,
      amount: event.amount,
      perShare: event.perShare ?? null,
      instrumentName: nameOf(instrumentNames, event.instrumentId),
      accountName: nameOf(accountNames, event.accountId as AccountId | undefined),
      toAccountName: nameOf(accountNames, event.toAccountId),
    }));
}

/** The largest positions over all open depots at the bid without mark-up (PS §10.3). */
export function topPositionEntries(
  depots: readonly DepotEntry[],
  instruments: Dictionary<Instrument>,
  quotes: Dictionary<SeriesQuote>,
): TopPositionEntry[] {
  return topPositions(
    depots.flatMap((depot) =>
      depot.positions.map((position) => {
        const instrument = instruments[position.instrumentId];
        const quote = instrument === undefined ? undefined : quotes[instrument.series];
        return {
          instrumentId: position.instrumentId,
          name: instrument?.name ?? position.instrumentId,
          quantity: position.quantity,
          cost: position.cost,
          bid: quote?.bid ?? null,
        };
      }),
    ),
  ).map(({ instrumentId, name, value, gainRatio, share }) => ({
    instrumentId,
    name,
    value,
    gainRatio,
    share,
  }));
}

/** The first `count` watchlist entries with their last price and change of the day. */
export function watchlistSummary(
  ids: readonly string[],
  instruments: Dictionary<Instrument>,
  quotes: Dictionary<SeriesQuote>,
  count: number,
): WatchlistSummary {
  return {
    total: ids.length,
    entries: ids.slice(0, count).map((instrumentId) => {
      const instrument = instruments[instrumentId];
      const quote = instrument === undefined ? undefined : quotes[instrument.series];
      return {
        instrumentId,
        name: instrument?.name ?? instrumentId,
        last: quote?.last ?? null,
        changeRatio: quote?.changeRatio ?? null,
      };
    }),
  };
}

/** Series of the top positions and the shown watchlist entries, sorted, without duplicates. */
export function dashboardSeries(
  instrumentIds: readonly string[],
  instruments: Dictionary<Instrument>,
): number[] {
  const series = new Set<number>();
  for (const id of instrumentIds) {
    const instrument = instruments[id];
    if (instrument !== undefined) {
      series.add(instrument.series);
    }
  }
  return [...series].sort((a, b) => a - b);
}
