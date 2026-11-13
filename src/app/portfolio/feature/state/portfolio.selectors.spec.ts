import { AccountEntry } from '@app/banking/feature/state/banking.model';
import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import { PositionView } from '@app/engine/domain/models/trading-view.model';
import { IndexComposition } from '@app/market/domain/models/instrument-figures.model';
import { Instrument } from '@app/market/domain/models/instrument.model';
import { DepotEntry } from '@app/trading/feature/state/trading.model';
import { Bank } from '@app/world/domain/models/bank.model';

import { initialPortfolioState, PortfolioState } from './portfolio.reducer';
import {
  selectMissingCompositions,
  selectPortfolioSeries,
  selectPortfolioView,
} from './portfolio.selectors';

const BANK = { id: 'bnk-1', name: 'Darara Invest' } as Bank;

const SHARE = {
  id: 'stk-1',
  kind: 'stock',
  name: 'Astix',
  series: 4,
  regionId: 'north-america',
  sectorId: 'technology',
} as Instrument;
const ETF = {
  id: 'etf-1',
  kind: 'etf',
  name: 'Welt ETF',
  series: 2,
  regionId: null,
  sectorId: null,
} as Instrument;
const INSTRUMENTS = { [SHARE.id]: SHARE, [ETF.id]: ETF };

const COMPOSITION = {
  indexId: 'idx-1',
  constituentCount: 2,
  top: [],
  regions: [
    { key: 'europe', weight: 0.6 },
    { key: 'north-america', weight: 0.4 },
  ],
  sectors: [{ key: 'financials', weight: 1 }],
} as IndexComposition;

function quote(series: number, bid: number): SeriesQuote {
  return {
    series,
    last: bid,
    bid,
    ask: bid + 0.1,
    previousClose: bid,
    change: 0,
    changeRatio: 0,
  };
}

function position(instrumentId: string, quantity: number, cost: number): PositionView {
  return {
    instrumentId,
    quantity,
    free: quantity,
    cost,
    lots: [],
    realizedGain: 0,
    distributions: 0,
  };
}

function account(
  id: string,
  kind: AccountEntry['kind'],
  balance: number,
  closedAt: number | null = null,
): AccountEntry {
  return {
    id: id as AccountEntry['id'],
    kind,
    bankId: BANK.id,
    number: id,
    depot: null,
    openedAt: 0,
    closedAt,
    balance,
    overdraftLimit: null,
    available: balance,
    reserved: 0,
    salaryAccount: false,
    bank: BANK,
  };
}

function depot(depotId: `dep-${number}`, balance: number, positions: PositionView[]): DepotEntry {
  return {
    depotId,
    number: `D${depotId}`,
    bank: BANK,
    clearingAccount: account(`acc-${depotId}`, 'clearing', balance),
    open: true,
    positions,
  };
}

// Two depots: the share in both (10 + 5 shares), the ETF in the second.
const DEPOTS = [
  depot('dep-1', 10_000, [position(SHARE.id, 10_000_000, 101_300)]),
  depot('dep-2', 20_000, [
    position(ETF.id, 20_000_000, 200_670),
    position(SHARE.id, 5_000_000, 52_000),
  ]),
];
const ACCOUNTS = [
  account('acc-1', 'current', 70_000),
  account('acc-9', 'savings', 99_999, 5),
  DEPOTS[0].clearingAccount,
  DEPOTS[1].clearingAccount,
];
const QUOTES = { 4: quote(4, 110), 2: quote(2, 95.505) };

function state(changes: Partial<PortfolioState> = {}): PortfolioState {
  return { ...initialPortfolioState, ...changes };
}

describe('portfolio selectors', () => {
  describe('selectPortfolioSeries', () => {
    it('lists the series of the held instruments once, sorted', () => {
      expect(selectPortfolioSeries.projector(DEPOTS, INSTRUMENTS)).toEqual([2, 4]);
    });
  });

  describe('selectMissingCompositions', () => {
    it('asks for held ETFs without a composition of the market day', () => {
      expect(selectMissingCompositions.projector(DEPOTS, INSTRUMENTS, state(), 100)).toEqual({
        day: 100,
        ids: [ETF.id],
      });
    });

    it('skips compositions loaded, loading or failed on the market day and asks on the next', () => {
      const loaded = state({ compositions: { [ETF.id]: { day: 100, composition: COMPOSITION } } });
      expect(selectMissingCompositions.projector(DEPOTS, INSTRUMENTS, loaded, 100).ids).toEqual([]);
      expect(selectMissingCompositions.projector(DEPOTS, INSTRUMENTS, loaded, 101).ids).toEqual([
        ETF.id,
      ]);
      const loading = state({ loading: { [ETF.id]: 100 } });
      expect(selectMissingCompositions.projector(DEPOTS, INSTRUMENTS, loading, 100).ids).toEqual(
        [],
      );
      const failed = state({ failed: { [ETF.id]: 100 } });
      expect(selectMissingCompositions.projector(DEPOTS, INSTRUMENTS, failed, 100).ids).toEqual([]);
      expect(selectMissingCompositions.projector(DEPOTS, INSTRUMENTS, failed, 101).ids).toEqual([
        ETF.id,
      ]);
    });
  });

  describe('selectPortfolioView', () => {
    it('combines all depots per instrument and counts the money on all open accounts', () => {
      const view = selectPortfolioView.projector(
        DEPOTS,
        ACCOUNTS,
        INSTRUMENTS,
        QUOTES,
        state({ compositions: { [ETF.id]: { day: 1, composition: COMPOSITION } } }),
      );
      expect(view.depotId).toBeNull();
      // Default sort: value descending. 15 × 110 € = 1.650,00 €; 20 × 95,505 € = 1.910,10 €.
      expect(view.rows.map((row) => [row.instrumentId, row.quantity, row.cost, row.value])).toEqual(
        [
          [ETF.id, 20_000_000, 200_670, 191_010],
          [SHARE.id, 15_000_000, 153_300, 165_000],
        ],
      );
      expect(view.rows.every((row) => row.depotId === null)).toBe(true);
      expect(view.cash).toBe(70_000 + 10_000 + 20_000);
      expect(view.allocation?.regions).toEqual([
        { key: 'north-america', value: 165_000 + 76_404, share: 241_404 / 356_010 },
        { key: 'europe', value: 114_606, share: 114_606 / 356_010 },
      ]);
      expect(view.allocation?.lookThroughPending).toBe(false);
    });

    it('shows one depot with its clearing account and trades in it', () => {
      const view = selectPortfolioView.projector(
        DEPOTS,
        ACCOUNTS,
        INSTRUMENTS,
        QUOTES,
        state({ depotId: 'dep-1' }),
      );
      expect(view.depotId).toBe('dep-1');
      expect(view.rows).toHaveLength(1);
      expect(view.rows[0]).toMatchObject({
        instrumentId: SHARE.id,
        depotId: 'dep-1',
        value: 110_000,
      });
      expect(view.cash).toBe(10_000);
      expect(view.allocation?.assetClasses).toEqual([
        { key: 'stock', value: 110_000, share: 110_000 / 120_000 },
        { key: 'cash', value: 10_000, share: 10_000 / 120_000 },
      ]);
    });

    it('falls back to all depots when the chosen one is no longer open', () => {
      const view = selectPortfolioView.projector(
        DEPOTS,
        ACCOUNTS,
        INSTRUMENTS,
        QUOTES,
        state({ depotId: 'dep-8' }),
      );
      expect(view.depotId).toBeNull();
      expect(view.rows).toHaveLength(2);
    });

    it('has no allocation while a quote is missing and waits for the ETF composition', () => {
      expect(
        selectPortfolioView.projector(DEPOTS, ACCOUNTS, INSTRUMENTS, { 4: QUOTES[4] }, state())
          .allocation,
      ).toBeNull();
      const pending = selectPortfolioView.projector(DEPOTS, ACCOUNTS, INSTRUMENTS, QUOTES, state());
      expect(pending.allocation?.lookThroughPending).toBe(true);
      const failed = selectPortfolioView.projector(
        DEPOTS,
        ACCOUNTS,
        INSTRUMENTS,
        QUOTES,
        state({ failed: { [ETF.id]: 1 } }),
      );
      expect(failed.allocation?.lookThroughPending).toBe(false);
      expect(failed.allocation?.regions[0]).toMatchObject({ key: 'unassigned', value: 191_010 });
    });

    it('sorts by the chosen column', () => {
      const view = selectPortfolioView.projector(
        DEPOTS,
        ACCOUNTS,
        INSTRUMENTS,
        QUOTES,
        state({ sort: { key: 'name', direction: 'ascending' } }),
      );
      expect(view.rows.map((row) => row.name)).toEqual(['Astix', 'Welt ETF']);
    });
  });
});
