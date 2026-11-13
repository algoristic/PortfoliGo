import { AccountId, DepotId } from '@app/banking/domain/models/account.model';
import { Transaction } from '@app/banking/domain/models/ledger.model';
import { dateTimeToTick, dayStartTick, tickToDateTime } from '@app/clock/domain/calendar-logic';
import {
  CalendarDate,
  Tick,
  TICKS_PER_HOUR,
  TICKS_PER_MINUTE,
} from '@app/clock/domain/models/time.model';
import { etfSeries, seriesIds } from '@app/market/domain/series';
import { Cents } from '@app/shared/domain/models/money.model';
import { OrderSpec } from '@app/trading/domain/models/order.model';
import { Bank } from '@app/world/domain/models/bank.model';
import { miniWorld } from '@app/world/domain/testing/mini-world';

import { GameEngine } from './game-engine';
import { createGameWorld } from './game-world';
import { GameSnapshot, GameState } from './models/game-state.model';
import { GameWorld } from './models/game-world.model';
import { startBankingGame, TEST_BANKS, withBooks } from './testing/banking-game';
import { MINI_START_CONDITIONS } from './testing/mini-game';
import { TestMarket, TestPrice } from './testing/test-market';

import { TEST_SEEDS } from '../../../testing/seeds';

// Taxes on sales, payouts and interest in the engine (TS §7.7; US-ST-01–03, E-11) against the test
// market without spread and the broker `bt` without order fees or interest: a sale of 10 shares at
// p € credits exactly 10 × p €. The player holds 100 shares of an accumulating ETF (no payouts) in
// one lot for 10.000,00 €, so every sale of 10 shares has a cost basis of 1.000,00 €. The depot
// `dep-3` with the clearing account `acc-2` exists from the start (Mo 01.04.2030 00:00). The
// expected taxes are those of the tables in TS §7.7.

const SHARE = 1_000_000;
const DEPOT: DepotId = 'dep-3';
const CLEARING: AccountId = 'acc-2';

const BROKER: Bank = {
  id: 'bt',
  name: 'Steuerbroker',
  type: 'online-broker',
  conditions: {
    currentAccount: null,
    savingsAccount: null,
    depot: {
      custodyFee: { kind: 'none' },
      orderFee: { kind: 'free' },
      exchangeFee: 0,
      savingsPlanFee: { kind: 'free' },
      clearingAccountRate: 0,
      clearingAccountDebitRate: 0,
      venue: 'exchange',
      spreadMarkup: 0,
      fractionalShares: true,
    },
  },
};

/** A sale of 10 ETF shares on a trading day at a price that holds from that day's start. */
interface Sale {
  date: CalendarDate;
  price: number;
}

interface Setup {
  sales: readonly Sale[];
  /** Credit interest accrued on the clearing account, booked by the first bank run (01.04. 06:00). */
  interest?: Cents;
  /** Shares of a further instrument, one lot for 100 € a share. */
  held?: Readonly<Record<string, number>>;
}

interface TaxBooking {
  tick: Tick;
  type: string;
  amount: Cents;
  refs?: Readonly<Record<string, string>>;
}

describe('GameEngine taxes', () => {
  let world: GameWorld;
  let start: GameSnapshot;
  let monthStarts: ReturnType<GameEngine['monthStartsAfter']>;
  let ids: string[];
  let etfId: string;
  /** Minute of the day an hour after the open of the ETF's exchange. */
  let tradingMinute: number;
  let dividend: { instrumentId: string; cents: Cents; paymentTick: Tick };

  beforeAll(() => {
    const { seedKey, world: mini } = miniWorld(TEST_SEEDS.mini);
    const engine = startBankingGame(createGameWorld(seedKey, mini), MINI_START_CONDITIONS);
    world = { ...engine.world, world: { ...engine.world.world, banks: [...TEST_BANKS, BROKER] } };
    start = engine.snapshot();
    monthStarts = engine.monthStartsAfter(-1);
    ids = seriesIds(world.context);
    const e = mini.etfs.findIndex(({ distribution }) => distribution.kind === 'accumulating');
    etfId = ids[etfSeries(world.context, e)];
    expect(etfId).toBe(mini.etfs[e].id);
    const exchange = world.exchanges.find(({ etfs }) => etfs.includes(e));
    if (exchange === undefined) {
      throw new Error('the accumulating ETF is not listed');
    }
    tradingMinute = exchange.open + 60;
    const etfs = new Set(mini.etfs.map(({ id }) => id));
    engine.runUntil(dateTimeToTick({ year: 2030, month: 9, day: 1 }));
    const exDate = engine
      .drainEvents()
      .find((event) => event.type === 'ex-dividend' && !etfs.has(ids[event.series]));
    if (exDate?.type !== 'ex-dividend') {
      throw new Error('the mini world has no ex-date of a share in the first months');
    }
    dividend = {
      instrumentId: ids[exDate.series],
      cents: exDate.cents,
      paymentTick: dayStartTick(exDate.paymentDay) + 6 * TICKS_PER_HOUR,
    };
  });

  function saleTick({ date }: Sale): Tick {
    return dateTimeToTick(date) + tradingMinute * TICKS_PER_MINUTE;
  }

  function setup({ sales, interest = 0, held = {} }: Setup): GameEngine {
    const state = withBooks(start, { accounts: [{ kind: 'clearing', bankId: 'bt' }] }) as GameState;
    state.player.positions = [
      {
        depotId: DEPOT,
        instrumentId: etfId,
        quantity: 100 * SHARE,
        lots: [{ buyTick: 0, quantity: 100 * SHARE, cost: 1_000_000 }],
        realizedGain: 0,
        distributions: 0,
      },
      ...Object.entries(held).map(([instrumentId, quantity]) => ({
        depotId: DEPOT,
        instrumentId,
        quantity,
        lots: [{ buyTick: 0, quantity, cost: Math.round((quantity / SHARE) * 10_000) }],
        realizedGain: 0,
        distributions: 0,
      })),
    ];
    const accrual = state.player.interest.find(({ accountId }) => accountId === CLEARING);
    if (accrual === undefined) {
      throw new Error('the clearing account has no interest accrual');
    }
    accrual.pendingCredit = interest;
    const prices: TestPrice[][] = ids.map(() => [{ tick: 0, price: 100 }]);
    prices[ids.indexOf(etfId)].push(
      ...sales.map(({ date, price }) => ({ tick: dateTimeToTick(date), price })),
    );
    return GameEngine.restore(world, state, {
      monthStarts,
      prices: () => new TestMarket(prices, 0),
    });
  }

  let commandSeq = 0;

  function sellEtf(engine: GameEngine, sale: Sale, quantity = 10 * SHARE): void {
    engine.runUntil(saleTick(sale));
    commandSeq++;
    const order: OrderSpec = {
      depotId: DEPOT,
      instrumentId: etfId,
      side: 'sell',
      type: 'market',
      size: { kind: 'quantity', quantity },
      limit: null,
      stop: null,
      validity: { kind: 'day' },
    };
    const result = engine.applyCommand({
      type: 'placeOrder',
      order,
      id: `c${commandSeq}`,
      tick: engine.tick,
    });
    expect(result.ok).toBe(true);
    expect(engine.player.orderHistory.at(-1)?.status).toBe('executed');
  }

  /** Runs the sales in order, then up to `until`; returns the tax bookings of the journal. */
  function run(engine: GameEngine, sales: readonly Sale[], until: Tick): TaxBooking[] {
    const journal: Transaction[] = [];
    for (const sale of sales) {
      sellEtf(engine, sale);
      journal.push(...engine.drainTransactions());
    }
    engine.runUntil(until);
    journal.push(...engine.drainTransactions());
    return taxBookings(journal);
  }

  function taxBookings(journal: readonly Transaction[]): TaxBooking[] {
    return journal
      .filter(({ type }) => type === 'tax' || type === 'tax-refund')
      .map(({ tick, type, postings, refs }) => {
        expect(postings).toEqual([
          expect.objectContaining({ account: postings[0].account }),
          expect.objectContaining({ account: 'external:tax-office', amount: -postings[0].amount }),
        ]);
        expect(postings[0].account).toBe(CLEARING);
        return { tick, type, amount: postings[0].amount, ...(refs === undefined ? {} : { refs }) };
      });
  }

  function date(year: number, month: number, day: number): CalendarDate {
    return { year, month, day };
  }

  describe('US-ST-01, US-ST-03: sales with interest, mixed, over the year end (TS §7.7)', () => {
    // TS §7.7, table "Verkäufe, Zinsen und Verlustvortrag"
    const sales: Sale[] = [
      { date: date(2030, 4, 2), price: 250 },
      { date: date(2030, 5, 2), price: 40 },
      { date: date(2030, 5, 3), price: 20 },
      { date: date(2030, 5, 6), price: 10 },
      { date: date(2031, 1, 2), price: 230 },
      { date: date(2031, 1, 3), price: 150 },
    ];

    it('withholds, refunds on the clearing account and carries the loss into 2031', () => {
      const engine = setup({ sales, interest: 40_000 });
      const sale = (n: number): Tick => saleTick(sales[n]);
      const refs = (n: number): Record<string, string> => ({
        orderId: `ord-${n + 1}`,
        depotId: DEPOT,
        instrumentId: etfId,
      });
      const taxes = run(engine, sales.slice(0, 4), dateTimeToTick(date(2030, 12, 31)));
      // No. 1: the interest of 400,00 € on 01.04. 06:00 stays below the allowance.
      expect(taxes).toEqual([
        { tick: sale(0), type: 'tax', amount: -22_500, refs: refs(0) },
        { tick: sale(1), type: 'tax-refund', amount: 15_000, refs: refs(1) },
        { tick: sale(2), type: 'tax-refund', amount: 7_500, refs: refs(2) },
      ]);
      expect(engine.player.taxYear).toMatchObject({
        year: 2030,
        income: -40_000,
        withheld: 0,
        interest: 40_000,
        gains: 150_000,
        losses: -230_000,
        paid: 22_500,
        refunded: 22_500,
      });
      // 400 + 2.500 − 225 + 400 + 150 + 200 + 75 + 100 €
      expect(engine.player.balances.get(CLEARING)).toBe(360_000);

      expect(run(engine, sales.slice(4), dateTimeToTick(date(2031, 12, 31)))).toEqual([
        { tick: sale(5), type: 'tax', amount: -10_000, refs: refs(5) },
      ]);
      expect(engine.player.closedTaxYears).toEqual([
        expect.objectContaining({ year: 2030, lossCarryForward: 0, income: -40_000 }),
      ]);
      expect(engine.player.taxYear).toMatchObject({
        year: 2031,
        lossCarryForward: -40_000,
        income: 180_000,
        withheld: 10_000,
        gains: 180_000,
        paid: 10_000,
        refunded: 0,
      });
      engine.runUntil(dateTimeToTick(date(2032, 1, 1)));
      expect(engine.player.closedTaxYears.map(({ year }) => year)).toEqual([2030, 2031]);
      expect(engine.player.taxYear).toMatchObject({ year: 2032, lossCarryForward: 0 });
    });

    it('reports the tax with the sale and a refund as its own notification (US-HD-02)', () => {
      const engine = setup({ sales });
      sellEtf(engine, sales[0]);
      sellEtf(engine, sales[1]);
      const executed = engine.drainEvents().filter(({ type }) => type === 'order-executed');
      expect(executed).toEqual([
        expect.objectContaining({ total: 250_000, tax: 12_500 }),
        expect.objectContaining({ total: 40_000, tax: -12_500 }),
      ]);
      const notified = engine.drainNotifications().flatMap((notification): unknown[][] => {
        switch (notification.code) {
          case 'order-executed':
            return [[notification.code, notification.params.tax]];
          case 'tax-refund':
            return [[notification.code, notification.params.accountId, notification.params.amount]];
          default:
            return [];
        }
      });
      expect(notified).toEqual([
        ['order-executed', 12_500],
        ['order-executed', -12_500],
        ['tax-refund', CLEARING, 12_500],
      ]);
      expect(engine.player.balances.get(CLEARING)).toBe(250_000 - 12_500 + 40_000 + 12_500);
    });
  });

  describe('US-ST-02: only gains, the allowance lapses (TS §7.7)', () => {
    it('taxes the second year on all above 1.000 €', () => {
      // TS §7.7, table "Nur Gewinne": 600 € in 2030 leave 400 € of the allowance unused.
      const sales: Sale[] = [
        { date: date(2030, 4, 2), price: 160 },
        { date: date(2031, 1, 2), price: 240 },
      ];
      const engine = setup({ sales });
      expect(run(engine, sales, dateTimeToTick(date(2031, 2, 1)))).toEqual([
        expect.objectContaining({ tick: saleTick(sales[1]), type: 'tax', amount: -10_000 }),
      ]);
      expect(engine.player.closedTaxYears).toEqual([
        expect.objectContaining({ year: 2030, income: 60_000, gains: 60_000, withheld: 0 }),
      ]);
      expect(engine.player.taxYear).toMatchObject({ lossCarryForward: 0, withheld: 10_000 });
    });
  });

  describe('US-ST-03: only losses (TS §7.7)', () => {
    it('books nothing and carries the losses over the following years', () => {
      // TS §7.7, table "Nur Verluste"
      const sales: Sale[] = [
        { date: date(2030, 4, 2), price: 40 },
        { date: date(2030, 4, 3), price: 20 },
      ];
      const engine = setup({ sales });
      expect(run(engine, sales, dateTimeToTick(date(2032, 1, 1)))).toEqual([]);
      expect(engine.player.closedTaxYears).toEqual([
        expect.objectContaining({ year: 2030, losses: -140_000, paid: 0, refunded: 0 }),
        expect.objectContaining({ year: 2031, lossCarryForward: -140_000, income: 0 }),
      ]);
      expect(engine.player.taxYear).toMatchObject({ year: 2032, lossCarryForward: -140_000 });
      expect(engine.player.balances.get(CLEARING)).toBe(60_000);
    });
  });

  describe('US-ST-01, US-ST-03: dividends in the loss pool (TS §7.4, §7.7)', () => {
    it('withholds on a dividend above the allowance and refunds it with a later loss', () => {
      // A gain of 1.500,00 € uses the allowance and leaves 500,00 € taxed with 125,00 €; the
      // dividend D is then taxed with 25 % (half a cent rounded up). Selling 30 shares at 1,00 €
      // loses 2.970,00 €, more than gain and dividend: everything withheld comes back.
      const { instrumentId, cents, paymentTick } = dividend;
      const sales: Sale[] = [
        { date: date(2030, 4, 1), price: 250 },
        { date: dayOf(paymentTick), price: 1 },
      ];
      const engine = setup({ sales, held: { [instrumentId]: 100 * SHARE } });
      const amount = 100 * cents;
      expect(amount).toBeLessThan(247_000);
      sellEtf(engine, sales[0]);
      engine.runUntil(paymentTick);
      const dividendTax = Math.round(amount / 4);
      expect(taxBookings(engine.drainTransactions())).toEqual([
        expect.objectContaining({ type: 'tax', amount: -12_500 }),
        {
          tick: paymentTick,
          type: 'tax',
          amount: -dividendTax,
          refs: { depotId: DEPOT, instrumentId },
        },
      ]);
      const paid = engine.drainEvents().filter(({ type }) => type === 'distribution-paid');
      expect(paid).toEqual([expect.objectContaining({ amount, tax: dividendTax })]);
      expect(
        engine.drainNotifications().filter(({ code }) => code === 'dividend-received'),
      ).toEqual([
        expect.objectContaining({ params: expect.objectContaining({ tax: dividendTax }) }),
      ]);
      expect(engine.player.taxYear).toMatchObject({ distributions: amount, gains: 150_000 });

      sellEtf(engine, sales[1], 30 * SHARE);
      expect(taxBookings(engine.drainTransactions())).toEqual([
        expect.objectContaining({ type: 'tax-refund', amount: 12_500 + dividendTax }),
      ]);
      expect(engine.player.taxYear).toMatchObject({
        losses: -297_000,
        withheld: 0,
        paid: 12_500 + dividendTax,
        refunded: 12_500 + dividendTax,
      });
    });
  });

  function dayOf(tick: Tick): CalendarDate {
    const { year, month, day } = tickToDateTime(tick);
    return { year, month, day };
  }
});
