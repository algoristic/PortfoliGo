import { Dictionary } from '@ngrx/entity';

import { DepotId } from '@app/banking/domain/models/account.model';
import { AccountEntry } from '@app/banking/feature/state/banking.model';
import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import { OrderView } from '@app/engine/domain/models/trading-view.model';
import { Instrument } from '@app/market/domain/models/instrument.model';
import {
  assetClassAllocation,
  regionAllocation,
  sectorAllocation,
} from '@app/portfolio/domain/allocation-logic';
import { AllocationHolding } from '@app/portfolio/domain/models/allocation.model';
import { HeldPosition } from '@app/portfolio/domain/models/portfolio.model';
import { positionDetail, positionTrades } from '@app/portfolio/domain/position-detail-logic';
import {
  combinePositions,
  positionOverview,
  sortPositions,
} from '@app/portfolio/domain/position-overview-logic';
import { Cents } from '@app/shared/domain/models/money.model';
import { DepotEntry } from '@app/trading/feature/state/trading.model';

import { LoadedComposition } from './portfolio.model';
import { PortfolioState } from './portfolio.reducer';

import { PortfolioView } from '../../ui/models/portfolio-view.model';
import { PositionDetailView } from '../../ui/models/position-detail-view.model';

/** IDs of the instruments held in the depots, in order of appearance, without duplicates. */
export function heldInstrumentIds(depots: readonly DepotEntry[]): string[] {
  return [
    ...new Set(depots.flatMap((depot) => depot.positions.map((position) => position.instrumentId))),
  ];
}

/** Series of the held instruments the master data knows, sorted (the quote subscription). */
export function heldSeries(
  depots: readonly DepotEntry[],
  instruments: Dictionary<Instrument>,
): number[] {
  return heldInstrumentIds(depots)
    .flatMap((id) => {
      const instrument = instruments[id];
      return instrument === undefined ? [] : [instrument.series];
    })
    .sort((a, b) => a - b);
}

/**
 * Held ETFs whose composition is missing for the market day `day`: not loaded for that day, not
 * loading for it and not failed on it (a failure is asked again on the next market day).
 */
export function missingCompositionIds(
  depots: readonly DepotEntry[],
  instruments: Dictionary<Instrument>,
  state: Pick<PortfolioState, 'compositions' | 'loading' | 'failed'>,
  day: number,
): string[] {
  return heldInstrumentIds(depots).filter(
    (id) =>
      instruments[id]?.kind === 'etf' &&
      state.compositions[id]?.day !== day &&
      state.loading[id] !== day &&
      state.failed[id] !== day,
  );
}

/** The shown depots: the chosen open one, else (also when it closed) all open depots. */
export function shownDepots(depots: readonly DepotEntry[], depotId: DepotId | null): DepotEntry[] {
  const chosen = depots.find((depot) => depot.depotId === depotId);
  return chosen === undefined ? [...depots] : [chosen];
}

/**
 * Money counted as „Liquidität“ (US-PF-03, TS §7.9): for one depot the balance of its clearing
 * account; for all depots the balances of all open accounts, so that the split by asset class
 * covers the net worth.
 */
export function shownCash(depot: DepotEntry | null, accounts: readonly AccountEntry[]): Cents {
  return depot !== null
    ? depot.clearingAccount.balance
    : accounts
        .filter((account) => account.closedAt === null)
        .reduce((sum, account) => sum + account.balance, 0);
}

/**
 * The depot page (US-PF-02, US-PF-03): positions of the shown depots (combined per instrument for
 * all depots) valued at the bid without mark-up, sorted, with the sum row; the allocation by asset
 * class, region and sector with look-through of the ETFs once every value is known.
 */
export function portfolioView(
  openDepots: readonly DepotEntry[],
  accounts: readonly AccountEntry[],
  instruments: Dictionary<Instrument>,
  quotes: Dictionary<SeriesQuote>,
  state: Pick<PortfolioState, 'depotId' | 'sort' | 'compositions' | 'failed'>,
): PortfolioView {
  const shown = shownDepots(openDepots, state.depotId);
  const single = shown.length === 1 && state.depotId !== null ? shown[0] : null;
  const held: HeldPosition[] = combinePositions(
    shown.flatMap((depot) =>
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
  );
  const { rows, totals } = positionOverview(held);
  const cash = shownCash(single, accounts);
  return {
    depots: openDepots.map((depot) => ({
      depotId: depot.depotId,
      number: depot.number,
      bankName: depot.bank?.name ?? null,
    })),
    depotId: single?.depotId ?? null,
    rows: sortPositions(rows, state.sort).map((row) => ({
      ...row,
      depotId: single?.depotId ?? null,
    })),
    totals,
    cash,
    sort: state.sort,
    allocation: allocationOf(rows, instruments, state.compositions, state.failed, cash),
  };
}

function allocationOf(
  rows: readonly { instrumentId: string; value: Cents | null }[],
  instruments: Dictionary<Instrument>,
  compositions: Readonly<Record<string, LoadedComposition>>,
  failed: Readonly<Record<string, number>>,
  cash: Cents,
): PortfolioView['allocation'] {
  let pending = false;
  const holdings: AllocationHolding[] = [];
  for (const { instrumentId, value } of rows) {
    const instrument = instruments[instrumentId];
    if (value === null || instrument === undefined) {
      return null;
    }
    if (
      instrument.kind === 'stock' &&
      instrument.regionId !== null &&
      instrument.sectorId !== null
    ) {
      holdings.push({
        kind: 'stock',
        value,
        regionId: instrument.regionId,
        sectorId: instrument.sectorId,
      });
    } else if (instrument.kind === 'etf') {
      // A composition of an earlier market day stays until the new one arrives.
      const composition = compositions[instrumentId]?.composition ?? null;
      pending ||= compositions[instrumentId] === undefined && failed[instrumentId] === undefined;
      holdings.push({ kind: 'etf', value, composition });
    }
  }
  return {
    assetClasses: assetClassAllocation(holdings, cash),
    regions: regionAllocation(holdings),
    sectors: sectorAllocation(holdings),
    lookThroughPending: pending,
  };
}

/** „<number> · <bank>“ of a depot; the number alone until the banks are loaded. */
export function depotLabel(depot: Pick<DepotEntry, 'number' | 'bank'>): string {
  return depot.bank === null ? depot.number : `${depot.number} · ${depot.bank.name}`;
}

/**
 * The position detail (US-PF-06) of the instrument `instrumentId` in the depot chosen on the
 * depot page, or in all open depots: head figures at the bid without mark-up, lots, realized gain,
 * distributions and the executions the order history keeps; the depot of lots and trades is named
 * only when several depots are shown. `null` while the instrument is unknown.
 */
export function positionDetailView(
  instrumentId: string | undefined,
  openDepots: readonly DepotEntry[],
  orders: readonly OrderView[],
  instruments: Dictionary<Instrument>,
  quotes: Dictionary<SeriesQuote>,
  depotId: DepotId | null,
): PositionDetailView | null {
  const instrument = instrumentId === undefined ? undefined : instruments[instrumentId];
  if (instrumentId === undefined || instrument === undefined) {
    return null;
  }
  const shown = shownDepots(openDepots, depotId);
  const single = shown.length === 1 && depotId !== null ? shown[0] : null;
  const labels = new Map(openDepots.map((depot) => [depot.depotId, depotLabel(depot)]));
  const depotOf = (id: DepotId): string | null =>
    shown.length > 1 ? (labels.get(id) ?? id) : null;
  const detail = positionDetail(
    shown.flatMap((depot) =>
      depot.positions
        .filter((position) => position.instrumentId === instrumentId)
        .map((position) => ({ ...position, depotId: depot.depotId })),
    ),
    instrument.name,
    quotes[instrument.series]?.bid ?? null,
  );
  const trades = positionTrades(orders, instrumentId, single === null ? null : [single.depotId]);
  return {
    instrumentId,
    name: instrument.name,
    depots: openDepots.map((depot) => ({
      depotId: depot.depotId,
      number: depot.number,
      bankName: depot.bank?.name ?? null,
    })),
    depotId: single?.depotId ?? null,
    detail,
    lots: (detail?.lots ?? []).map((lot, index) => ({
      key: `${lot.depotId}:${lot.buyTick}:${index}`,
      depot: depotOf(lot.depotId),
      buyTick: lot.buyTick,
      quantity: lot.quantity,
      cost: lot.cost,
      costPerShare: lot.costPerShare,
    })),
    trades: trades.map((trade) => ({
      orderId: trade.orderId,
      depot: depotOf(trade.depotId),
      side: trade.side,
      tick: trade.tick,
      quantity: trade.quantity,
      price: trade.price,
      costs: trade.costs,
      total: trade.total,
    })),
    chartTrades: trades.map(({ orderId, tick, side }) => ({ id: orderId, tick, side })).reverse(),
  };
}
