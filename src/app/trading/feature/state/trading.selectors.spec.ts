import { AccountEntry } from '@app/banking/feature/state/banking.model';
import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import { OrderView, PositionView } from '@app/engine/domain/models/trading-view.model';
import { Instrument } from '@app/market/domain/models/instrument.model';
import { OrderStatus } from '@app/trading/domain/models/order.model';
import { Bank } from '@app/world/domain/models/bank.model';

import { DepotEntry } from './trading.model';
import {
  selectDepots,
  selectOpenOrders,
  selectOrderHistory,
  selectPosition,
  selectRouteInstrumentTrade,
} from './trading.selectors';
import { orderTicketContext, preselectedDepot } from './trading.utils';

const BANK = {
  id: 'bnk-1',
  name: 'Darara Invest',
  type: 'online-broker',
  conditions: { depot: { spreadMarkup: 0 } },
} as unknown as Bank;

const SHARE = {
  id: 'stk-1',
  kind: 'stock',
  name: 'Astix',
  series: 0,
  exchangeId: 'exc-de',
} as Instrument;
const INDEX = {
  id: 'idx-1',
  kind: 'index',
  name: 'Welt',
  series: 9,
  exchangeId: null,
} as Instrument;

function account(id: string, depot: string | null, closedAt: number | null = null): AccountEntry {
  return {
    id: id as AccountEntry['id'],
    kind: depot === null ? 'current' : 'clearing',
    bankId: BANK.id,
    number: `000000000${id.slice(-1)}`,
    depot: depot === null ? null : { id: depot as `dep-${number}`, number: `D${depot}` },
    openedAt: 0,
    closedAt,
    balance: 50_000,
    overdraftLimit: null,
    available: 40_000,
    reserved: 10_000,
    salaryAccount: false,
    bank: BANK,
  };
}

function position(instrumentId: string, quantity: number, free = quantity): PositionView {
  return { instrumentId, quantity, free, cost: 0, lots: [], realizedGain: 0, distributions: 0 };
}

function order(n: number, status: OrderStatus, closedAt: number | null = null): OrderView {
  return { id: `ord-${n}`, status, closedAt } as OrderView;
}

const ACCOUNTS = [
  account('acc-1', null),
  account('acc-2', 'dep-3'),
  account('acc-4', 'dep-5', 99),
  account('acc-6', 'dep-7'),
];
const HOLDINGS = {
  'dep-3': [position('stk-1', 2_000_000, 0)],
  'dep-5': [position('stk-1', 9_000_000)],
  'dep-7': [position('stk-2', 1_000_000), position('stk-1', 1_500_000)],
};

describe('trading selectors', () => {
  const depots = selectDepots.projector(ACCOUNTS, HOLDINGS);

  it('lists active orders in placement order and the history newest first', () => {
    const orders = [
      order(10, 'open'),
      order(2, 'triggered'),
      order(3, 'executed', 50),
      order(4, 'cancelled', 70),
      order(5, 'expired', 50),
    ];
    expect(selectOpenOrders.projector(orders).map(({ id }) => id)).toEqual(['ord-2', 'ord-10']);
    expect(selectOrderHistory.projector(orders).map(({ id }) => id)).toEqual([
      'ord-4',
      'ord-5',
      'ord-3',
    ]);
  });

  it('builds depots from the clearing accounts with their positions, closed ones marked', () => {
    expect(depots.map(({ depotId, open, positions }) => [depotId, open, positions.length])).toEqual(
      [
        ['dep-3', true, 1],
        ['dep-5', false, 1],
        ['dep-7', true, 2],
      ],
    );
    expect(depots[0]).toMatchObject({ number: 'Ddep-3', bank: BANK });
    expect(depots[0].clearingAccount.id).toBe('acc-2');
    expect(selectDepots.projector(ACCOUNTS, {})[0].positions).toEqual([]);
  });

  it('finds the position of an instrument in a depot', () => {
    expect(selectPosition('dep-7', 'stk-1').projector(HOLDINGS)?.quantity).toBe(1_500_000);
    expect(selectPosition('dep-7', 'stk-9').projector(HOLDINGS)).toBeNull();
    expect(selectPosition('dep-9', 'stk-1').projector(HOLDINGS)).toBeNull();
  });

  it('sums the shares in the open depots for the instrument page (US-HD-02)', () => {
    expect(selectRouteInstrumentTrade.projector(SHARE, depots)).toEqual({
      instrumentId: 'stk-1',
      name: 'Astix',
      tradable: true,
      hasDepot: true,
      quantity: 3_500_000,
      free: 1_500_000,
    });
    expect(selectRouteInstrumentTrade.projector(INDEX, [])).toMatchObject({
      tradable: false,
      hasDepot: false,
      quantity: 0,
    });
    expect(selectRouteInstrumentTrade.projector(null, depots)).toBeNull();
  });

  describe('preselectedDepot', () => {
    it.each<[string, 'buy' | 'sell', string | undefined, string | null]>([
      ['the given open depot', 'buy', 'dep-7', 'dep-7'],
      ['the first open depot for a purchase', 'buy', undefined, 'dep-3'],
      ['not a closed depot', 'buy', 'dep-5', 'dep-3'],
      ['the first open depot with free shares for a sale', 'sell', undefined, 'dep-7'],
    ])('chooses %s', (_label, side, given, expected) => {
      expect(preselectedDepot(side, 'stk-1', depots, given as DepotEntry['depotId'])).toBe(
        expected,
      );
    });

    it('has none without an open depot', () => {
      expect(
        preselectedDepot(
          'buy',
          'stk-1',
          depots.filter((depot) => !depot.open),
        ),
      ).toBeNull();
    });
  });

  describe('orderTicketContext', () => {
    const quote: SeriesQuote = {
      series: 0,
      last: 0.01,
      bid: 0.0099,
      ask: 0.0101,
      previousClose: 0.02,
      change: -0.01,
      changeRatio: -0.5,
    };
    const exchanges = [{ id: 'exc-de', open: 540, close: 1050 }] as never;

    it('offers the open depots with balance, reservations and the position', () => {
      // Mo 01.04.2030, 10:00: the exchange is open; the mid at the floor of 0,01 €.
      const context = orderTicketContext(SHARE, quote, depots, exchanges, 5_390_520, null, 0.01);
      expect(context.quote).toEqual({ last: 0.01, bid: 0.0099, ask: 0.0101 });
      expect(context.atPriceFloor).toBe(true);
      expect(context.marketOpen).toBe(true);
      expect(context.depots.map((depot) => depot.depotId)).toEqual(['dep-3', 'dep-7']);
      expect(context.depots[1]).toMatchObject({
        bankName: 'Darara Invest',
        clearingBalance: 50_000,
        reserved: 10_000,
        position: position('stk-1', 1_500_000),
      });
    });

    it('has no quote for an index and closes at the weekend', () => {
      const context = orderTicketContext(
        SHARE,
        { ...quote, bid: null, ask: null, last: 5 },
        [],
        exchanges,
        5_389_920 + 5 * 1_440,
        null,
        0.01,
      );
      expect([context.quote, context.atPriceFloor, context.marketOpen]).toEqual([
        null,
        false,
        false,
      ]);
    });
  });
});
