import { AccountId } from '@app/banking/domain/models/account.model';
import { DepotConditions } from '@app/banking/domain/models/bank-conditions.model';
import { Transaction } from '@app/banking/domain/models/ledger.model';
import { dateTimeToTick } from '@app/clock/domain/calendar-logic';
import { Tick } from '@app/clock/domain/models/time.model';
import { marketChecksum } from '@app/market/domain/market-checksum';
import { indexSeries } from '@app/market/domain/series';
import { Cents, MicroUnits } from '@app/shared/domain/models/money.model';
import { Order, OrderChange, OrderSpec } from '@app/trading/domain/models/order.model';
import { Position } from '@app/trading/domain/models/position.model';
import { Bank } from '@app/world/domain/models/bank.model';
import { miniWorld } from '@app/world/domain/testing/mini-world';

import { accountViews } from './account-projection';
import { GameEngine } from './game-engine';
import { createGameWorld } from './game-world';
import { CommandResult, GameCommand } from './models/engine-command.model';
import { EngineEvent } from './models/engine-event.model';
import { GameSnapshot, GameState } from './models/game-state.model';
import { GameWorld } from './models/game-world.model';
import { startBankingGame, TEST_BANKS, withBooks } from './testing/banking-game';
import { MINI_START_CONDITIONS, miniGame } from './testing/mini-game';
import { TestMarket, TestPrice } from './testing/test-market';

import { TEST_SEEDS } from '../../../testing/seeds';

// Orders in the engine (TS §3.8, §7.5; US-HD-01–04) against the test market: prices per series from
// a tick on, bid and ask with a spread of 0,2 % on the price grid (mid 100 → 99,90 / 100,10). The
// banks are those of TS §7.5: F (0,25 %, min 10 €, max 60 €, 3 € exchange fee, whole shares), N
// (0,90 € flat, fractions), D (4,90 € + 0,25 %, max 69,90 €, fractions); `b3` charges 4,90 € flat
// without fractions. The share `stk-0001` trades on `exc-fr` (09:00–17:30), the ETF `etf-0001` on
// `exc-de` (09:00–17:30). Every player gets a depot `dep-3` with the clearing account `acc-2`.
// Expected amounts are computed in the comments from the quote, the shares and the fees.

const SHARE = 1_000_000;
const STOCK = 0;
const STOCK_ID = 'stk-0001';
const DEPOT = 'dep-3';
const CLEARING: AccountId = 'acc-2';

function at(day: number, hour = 0, minute = 0): Tick {
  return dateTimeToTick({ year: 2030, month: 4, day, hour, minute });
}

/** Monday 01.04., Tuesday 02.04. and Wednesday 03.04.2030. */
const MON = 1;
const TUE = 2;
const WED = 3;

function depot(
  orderFee: DepotConditions['orderFee'],
  exchangeFee: Cents,
  fractionalShares: boolean,
): DepotConditions {
  return {
    custodyFee: { kind: 'none' },
    orderFee,
    exchangeFee,
    savingsPlanFee: { kind: 'free' },
    clearingAccountRate: 0,
    clearingAccountDebitRate: 0,
    venue: 'exchange',
    spreadMarkup: 0,
    fractionalShares,
  };
}

function broker(id: string, conditions: DepotConditions): Bank {
  return {
    id,
    name: id,
    type: 'online-broker',
    conditions: { currentAccount: null, savingsAccount: null, depot: conditions },
  };
}

const ORDER_BANKS: readonly Bank[] = [
  ...TEST_BANKS,
  broker('bf', depot({ kind: 'percent', rate: 0.0025, min: 1_000, max: 6_000 }, 300, false)),
  broker('bn', depot({ kind: 'flat', amount: 90 }, 0, true)),
  broker(
    'bd',
    depot({ kind: 'flat-plus-percent', amount: 490, rate: 0.0025, max: 6_990 }, 0, true),
  ),
];

const MARKET_BUY: OrderSpec = {
  depotId: DEPOT,
  instrumentId: STOCK_ID,
  side: 'buy',
  type: 'market',
  size: { kind: 'quantity', quantity: 10 * SHARE },
  limit: null,
  stop: null,
  validity: { kind: 'day' },
};

function shares(quantity: MicroUnits): Pick<OrderSpec, 'size'> {
  return { size: { kind: 'quantity', quantity } };
}

interface Setup {
  bank?: string;
  balance?: Cents;
  positions?: readonly Position[];
  /** Prices per series from the given ticks on. */
  prices: Readonly<Record<number, readonly TestPrice[]>>;
  /** Tick to run to before the scenario starts; Monday 10:00 by default. */
  until?: Tick;
}

type WithoutStamp<T> = T extends unknown ? Omit<T, 'id' | 'tick'> : never;

describe('GameEngine orders', () => {
  let world: GameWorld;
  let start: GameSnapshot;
  let monthStarts: ReturnType<GameEngine['monthStartsAfter']>;
  let etfId: string;
  let etf: number;
  let indexId: string;
  let commandSeq: number;

  beforeAll(() => {
    const { seedKey, world: mini } = miniWorld(TEST_SEEDS.mini);
    const engine = startBankingGame(createGameWorld(seedKey, mini), MINI_START_CONDITIONS);
    world = { ...engine.world, world: { ...engine.world.world, banks: ORDER_BANKS } };
    start = engine.snapshot();
    monthStarts = engine.monthStartsAfter(-1);
    const { context } = world;
    etfId = context.etfs.ids[0];
    etf = context.layout.instrumentIds.length + 2 * context.indices.ids.length;
    indexId = context.indices.ids[0];
  });

  beforeEach(() => {
    commandSeq = 0;
  });

  function setup({
    bank = 'bf',
    balance = 500_000,
    positions = [],
    prices,
    until = at(MON, 10),
  }: Setup): GameEngine {
    const state = withBooks(start, {
      accounts: [{ kind: 'clearing', bankId: bank, balance }],
    }) as GameState;
    state.player.positions = positions.map((position) => ({ ...position }));
    const series: TestPrice[][] = [];
    for (const [key, entries] of Object.entries(prices)) {
      series[Number(key)] = [...entries];
    }
    const engine = GameEngine.restore(world, state, {
      monthStarts,
      prices: () => new TestMarket(series, 0.002),
    });
    engine.runUntil(until);
    engine.drainEvents();
    engine.drainTransactions();
    engine.drainNotifications();
    engine.drainChangedAccounts();
    return engine;
  }

  function apply(engine: GameEngine, body: WithoutStamp<GameCommand>): CommandResult {
    commandSeq++;
    return engine.applyCommand({ ...body, id: `c${commandSeq}`, tick: engine.tick } as GameCommand);
  }

  function place(engine: GameEngine, order: Partial<OrderSpec> = {}): CommandResult {
    return apply(engine, { type: 'placeOrder', order: { ...MARKET_BUY, ...order } });
  }

  function change(engine: GameEngine, orderId: string, changed: OrderChange): CommandResult {
    return apply(engine, { type: 'changeOrder', orderId, change: changed });
  }

  function cancel(engine: GameEngine, orderId: string): CommandResult {
    return apply(engine, { type: 'cancelOrder', orderId });
  }

  function order(engine: GameEngine, id: string): Order {
    const found = [...engine.player.orders, ...engine.player.orderHistory].find(
      (candidate) => candidate.id === id,
    );
    if (found === undefined) {
      throw new Error(`no order ${id}`);
    }
    return found;
  }

  function balance(engine: GameEngine): Cents {
    return engine.player.balances.get(CLEARING) ?? 0;
  }

  function available(engine: GameEngine): Cents {
    return accountViews(engine.player, [CLEARING])[0].available;
  }

  function orderEvents(events: readonly EngineEvent[]): [string, Tick][] {
    return events.flatMap((event) =>
      event.type.startsWith('order-') ? [[event.type, event.tick] as [string, Tick]] : [],
    );
  }

  function postings({ type, postings: list, units }: Transaction): unknown {
    return { type, postings: list.map((p) => [p.account, p.amount]), units };
  }

  describe('US-HD-01: buying', () => {
    it('executes a market order during the pause at once at the ask', () => {
      // Mid 99,90 → ask 100,00 €. TS §7.5: 10 × 100,00 = 1.000,00 €, fee min 10,00 € + 3,00 €.
      const engine = setup({ prices: { [STOCK]: [{ tick: 0, price: 99.9 }] } });
      const tick = engine.tick;
      expect(place(engine)).toEqual({ ok: true, orderId: 'ord-1' });
      expect(engine.tick).toBe(tick);
      expect(engine.player.orders).toEqual([]);
      expect(order(engine, 'ord-1')).toMatchObject({
        status: 'executed',
        placedAt: tick,
        closedAt: tick,
        reserved: 0,
        triggeredAt: null,
        rejection: null,
        execution: {
          tick,
          quantity: 10 * SHARE,
          price: 100,
          marketValue: 100_000,
          orderFee: 1_000,
          exchangeFee: 300,
          total: 101_300,
        },
      });
      expect(balance(engine)).toBe(500_000 - 101_300);
      expect(engine.player.positions).toEqual([
        { depotId: DEPOT, instrumentId: STOCK_ID, quantity: 10 * SHARE },
      ]);
      expect(engine.drainTransactions().map(postings)).toEqual([
        {
          type: 'buy',
          postings: [
            [CLEARING, -101_300],
            ['external:market', 100_000],
            ['external:bank:bf:fees', 1_300],
          ],
          units: [{ depotId: DEPOT, instrumentId: STOCK_ID, quantity: 10 * SHARE }],
        },
      ]);
      expect(orderEvents(engine.drainEvents())).toEqual([['order-executed', tick]]);
      expect(engine.autoPauseNotification).toBeNull();
      expect(engine.drainNotifications()).toEqual([
        expect.objectContaining({
          tick,
          code: 'order-executed',
          params: {
            orderId: 'ord-1',
            depotId: DEPOT,
            instrumentId: STOCK_ID,
            side: 'buy',
            quantity: 10 * SHARE,
            price: 100,
            total: 101_300,
          },
        }),
      ]);
      expect(engine.drainChangedOrders()).toEqual(['ord-1']);
      expect(engine.drainChangedDepots()).toEqual([DEPOT]);
      expect(engine.drainChangedAccounts()).toEqual([CLEARING]);
      expect(engine.player.monthlyValues.fees).toBe(1_300);
    });

    it('executes a market order placed before the open at the opening price with its gap', () => {
      // Reservation at ask 100,10 € (TS §7.5): 1.001,00 + 50,05 + 13,00 = 1.064,05 €.
      // Open 104 → ask 104,11 €: 1.041,10 € + 10,00 € + 3,00 € = 1.054,10 €.
      const engine = setup({
        prices: {
          [STOCK]: [
            { tick: 0, price: 100 },
            { tick: at(MON, 9), price: 104 },
          ],
        },
        until: at(MON, 8),
      });
      expect(place(engine)).toEqual({ ok: true, orderId: 'ord-1' });
      expect(order(engine, 'ord-1')).toMatchObject({ status: 'open', reserved: 106_405 });
      expect(available(engine)).toBe(500_000 - 106_405);
      engine.runUntil(at(MON, 8, 59));
      expect(order(engine, 'ord-1').status).toBe('open');
      engine.runUntil(at(MON, 9, 30));
      expect(order(engine, 'ord-1').execution).toMatchObject({
        tick: at(MON, 9),
        price: 104.11,
        total: 105_410,
      });
      expect(balance(engine)).toBe(500_000 - 105_410);
      expect(available(engine)).toBe(500_000 - 105_410);
    });

    it('executes a limit order once the ask reaches the limit; its reservation blocks transfers', () => {
      // TS §7.5: limit 99,00 for 10 shares reserves 990,00 € + 13,00 € = 1.003,00 €.
      // From 11:00 mid 98,90 → ask 99,00 €: 990,00 € + 10,00 € + 3,00 € = 1.003,00 €.
      const engine = setup({
        prices: {
          [STOCK]: [
            { tick: 0, price: 100 },
            { tick: at(MON, 11), price: 98.9 },
          ],
        },
      });
      expect(place(engine, { type: 'limit', limit: 99 })).toEqual({ ok: true, orderId: 'ord-1' });
      expect(order(engine, 'ord-1')).toMatchObject({ status: 'open', reserved: 100_300 });
      expect(available(engine)).toBe(399_700);
      const transfer = (amount: Cents): CommandResult =>
        apply(engine, {
          type: 'transfer',
          fromAccountId: CLEARING,
          toAccountId: 'acc-1',
          amount,
          purpose: '',
        });
      expect(transfer(399_701)).toEqual({ ok: false, error: 'insufficient-funds' });
      expect(transfer(399_700)).toEqual({ ok: true });
      expect(available(engine)).toBe(0);
      engine.runUntil(at(MON, 10, 59));
      expect(order(engine, 'ord-1').status).toBe('open');
      engine.runUntil(at(MON, 12));
      expect(order(engine, 'ord-1').execution).toMatchObject({
        tick: at(MON, 11),
        price: 99,
        total: 100_300,
      });
      expect(balance(engine)).toBe(0);
    });

    it('rejects an execution without cover and frees the reservation', () => {
      // Reservation 1.064,05 € fits into 1.100,00 €; at the open of 120 the debit is
      // 10 × 120,12 = 1.201,20 € + 10,00 € + 3,00 € = 1.214,20 € > 1.100,00 €.
      const engine = setup({
        balance: 110_000,
        prices: {
          [STOCK]: [
            { tick: 0, price: 100 },
            { tick: at(MON, 9), price: 120 },
          ],
        },
        until: at(MON, 8),
      });
      expect(place(engine).ok).toBe(true);
      engine.drainChangedAccounts();
      engine.runUntil(at(MON, 9));
      expect(order(engine, 'ord-1')).toMatchObject({
        status: 'rejected',
        rejection: 'insufficient-funds',
        closedAt: at(MON, 9),
        execution: null,
      });
      expect(engine.drainTransactions()).toEqual([]);
      expect(balance(engine)).toBe(110_000);
      expect(available(engine)).toBe(110_000);
      expect(engine.drainChangedAccounts()).toEqual([CLEARING]);
      expect(engine.drainNotifications()).toEqual([
        expect.objectContaining({
          code: 'order-rejected',
          params: {
            orderId: 'ord-1',
            depotId: DEPOT,
            instrumentId: STOCK_ID,
            side: 'buy',
            reason: 'insufficient-funds',
          },
        }),
      ]);
    });

    it('goes on with the next order of the tick after a rejection', () => {
      // Reservations 1.064,05 € and 118,11 € of 1.250,00 €. Open 120: the first purchase needs
      // 1.214,20 € > 1.250,00 − 118,11 € and is rejected, the second (1 share, 120,12 € + 13,00 €)
      // executes in the same tick.
      const engine = setup({
        balance: 125_000,
        prices: {
          [STOCK]: [
            { tick: 0, price: 100 },
            { tick: at(MON, 9), price: 120 },
          ],
        },
        until: at(MON, 8),
      });
      expect(place(engine).ok).toBe(true);
      expect(place(engine, shares(SHARE)).ok).toBe(true);
      engine.runUntil(at(MON, 9));
      expect(order(engine, 'ord-1').status).toBe('rejected');
      expect(order(engine, 'ord-2').execution).toMatchObject({ tick: at(MON, 9), total: 13_312 });
    });

    it('checks orders only while their exchange is open, also when every tick is stepped', () => {
      // Friday 05.04. after the close; the price falls on Saturday, the exchange opens on Monday.
      const engine = setup({
        prices: {
          [STOCK]: [
            { tick: 0, price: 100 },
            { tick: at(6, 9), price: 90 },
          ],
        },
        until: at(5, 18),
      });
      expect(place(engine, { type: 'limit', limit: 80, validity: { kind: 'gtc' } }).ok).toBe(true);
      while (engine.tick < at(6, 10)) {
        engine.step();
      }
      expect(change(engine, 'ord-1', { limit: 96 })).toEqual({ ok: true });
      expect(place(engine, { type: 'limit', limit: 96, validity: { kind: 'gtc' } }).ok).toBe(true);
      engine.step();
      expect(engine.player.orders.map(({ status }) => status)).toEqual(['open', 'open']);
      engine.runUntil(at(8, 9));
      expect(engine.player.orders).toEqual([]);
      expect(order(engine, 'ord-1').execution).toMatchObject({ tick: at(8, 9), price: 90.09 });
      expect(order(engine, 'ord-2').execution).toMatchObject({ tick: at(8, 9), price: 90.09 });
    });

    it('blocks purchases while the clearing account is negative, but not sales', () => {
      const engine = setup({
        balance: -1,
        positions: [{ depotId: DEPOT, instrumentId: STOCK_ID, quantity: 10 * SHARE }],
        prices: { [STOCK]: [{ tick: 0, price: 100 }] },
      });
      expect(place(engine)).toEqual({ ok: false, error: 'clearing-account-negative' });
      expect(place(engine, { side: 'sell', type: 'limit', limit: 200 }).ok).toBe(true);
    });

    it('rejects purchases at the price floor when placed and when executed (E-22)', () => {
      // Limit 1,00 € for 100 shares at ask 1,001 € waits; at mid 0,01 € the ask 0,0101 € meets it.
      const engine = setup({
        prices: {
          [STOCK]: [
            { tick: 0, price: 1 },
            { tick: at(MON, 11), price: 0.01 },
          ],
        },
      });
      expect(place(engine, { type: 'limit', limit: 1, ...shares(100 * SHARE) })).toEqual({
        ok: true,
        orderId: 'ord-1',
      });
      engine.runUntil(at(MON, 11));
      expect(order(engine, 'ord-1')).toMatchObject({
        status: 'rejected',
        rejection: 'price-floor',
      });
      expect(place(engine)).toEqual({ ok: false, error: 'price-floor' });
    });

    it('buys an ETF and refuses indices, unknown instruments and depots', () => {
      const engine = setup({ prices: { [etf]: [{ tick: 0, price: 99.9 }] } });
      expect(place(engine, { instrumentId: etfId })).toEqual({ ok: true, orderId: 'ord-1' });
      expect(order(engine, 'ord-1').execution).toMatchObject({ price: 100, total: 101_300 });
      expect(indexSeries(world.context, 0)).toBeLessThan(etf);
      expect(place(engine, { instrumentId: indexId })).toEqual({
        ok: false,
        error: 'instrument-not-tradable',
      });
      expect(place(engine, { instrumentId: 'stk-9999' })).toEqual({
        ok: false,
        error: 'unknown-instrument',
      });
      expect(place(engine, { depotId: 'dep-9' })).toEqual({ ok: false, error: 'unknown-depot' });
      expect(
        apply(engine, { type: 'placeOrder', order: { ...MARKET_BUY, side: 'short' } } as never),
      ).toEqual({ ok: false, error: 'invalid-command' });
    });

    it('refuses orders for a closed depot', () => {
      const engine = setup({ balance: 0, prices: { [STOCK]: [{ tick: 0, price: 100 }] } });
      expect(apply(engine, { type: 'closeAccount', accountId: CLEARING })).toEqual({ ok: true });
      expect(place(engine)).toEqual({ ok: false, error: 'depot-closed' });
    });
  });

  describe('US-HD-01: fee models and orders by amount', () => {
    it.each<[string, string, number, number, MicroUnits, Cents]>([
      // TS §7.5: 1.000 € at ask 33,33 € with N: 29,975997 shares, 999,10 € + 0,90 €.
      ['N (flat, fractions)', 'bn', 33.29, 100_000, 29_975_997, 100_000],
      // TS §7.5: 1.000 € at ask 50,00 € with D: 19,8524 shares, 992,62 € + 7,38 €.
      ['D (flat plus percent, fractions)', 'bd', 49.95, 100_000, 19_852_400, 100_000],
      // TS §7.5: 10.000 € at ask 100,10 € with F: 99 shares, 9.909,90 € + 27,77 €.
      ['F (percent with minimum, whole shares)', 'bf', 100, 1_000_000, 99 * SHARE, 993_767],
    ])('buys by amount with %s', (_case, bank, mid, amount, quantity, total) => {
      const engine = setup({
        bank,
        balance: 2_000_000,
        prices: { [STOCK]: [{ tick: 0, price: mid }] },
      });
      expect(place(engine, { size: { kind: 'amount', amount } }).ok).toBe(true);
      expect(order(engine, 'ord-1').execution).toMatchObject({ quantity, total });
      expect(balance(engine)).toBe(2_000_000 - total);
      expect(engine.player.positions).toEqual([
        { depotId: DEPOT, instrumentId: STOCK_ID, quantity },
      ]);
    });

    it('rejects an order by amount that buys nothing after costs', () => {
      // 5,00 € at ask 100,00 € with 4,90 € flat and whole shares (TS §7.5).
      const engine = setup({ bank: 'b3', prices: { [STOCK]: [{ tick: 0, price: 99.9 }] } });
      expect(place(engine, { size: { kind: 'amount', amount: 500 } }).ok).toBe(true);
      expect(order(engine, 'ord-1')).toMatchObject({
        status: 'rejected',
        rejection: 'amount-too-small',
      });
      expect(balance(engine)).toBe(500_000);
    });
  });

  describe('US-HD-02: selling', () => {
    it('sells at the bid and credits the proceeds after costs', () => {
      // TS §7.5: 10 × 99,90 = 999,00 € − 10,00 € − 3,00 € = 986,00 €.
      const engine = setup({
        positions: [{ depotId: DEPOT, instrumentId: STOCK_ID, quantity: 10 * SHARE }],
        prices: { [STOCK]: [{ tick: 0, price: 100 }] },
      });
      expect(place(engine, { side: 'sell' }).ok).toBe(true);
      expect(order(engine, 'ord-1').execution).toMatchObject({ price: 99.9, total: 98_600 });
      expect(balance(engine)).toBe(500_000 + 98_600);
      expect(engine.player.positions).toEqual([]);
      expect(engine.drainTransactions().map(postings)).toEqual([
        {
          type: 'sell',
          postings: [
            [CLEARING, 98_600],
            ['external:market', -99_900],
            ['external:bank:bf:fees', 1_300],
          ],
          units: [{ depotId: DEPOT, instrumentId: STOCK_ID, quantity: -10 * SHARE }],
        },
      ]);
    });

    it('sells only the free shares, fractions also at a bank without fractions', () => {
      const engine = setup({
        positions: [{ depotId: DEPOT, instrumentId: STOCK_ID, quantity: 10 * SHARE }],
        prices: { [STOCK]: [{ tick: 0, price: 100 }] },
      });
      const sell = (quantity: MicroUnits): CommandResult =>
        place(engine, { side: 'sell', type: 'limit', limit: 200, ...shares(quantity) });
      expect(sell(6 * SHARE).ok).toBe(true);
      expect(sell(4 * SHARE + 1)).toEqual({ ok: false, error: 'insufficient-quantity' });
      expect(sell(2_500_000).ok).toBe(true);
      expect(sell(1_500_000).ok).toBe(true);
      expect(sell(1)).toEqual({ ok: false, error: 'insufficient-quantity' });
      expect(place(engine, shares(1_500_000))).toEqual({
        ok: false,
        error: 'fractional-not-allowed',
      });
      expect(cancel(engine, 'ord-1')).toEqual({ ok: true });
      expect(sell(6 * SHARE).ok).toBe(true);
    });
  });

  describe('US-HD-03: order types and validity', () => {
    it('executes a stop loss below its stop after an overnight gap', () => {
      // Tuesday opens at 90 → bid 89,91 €: 899,10 € − 13,00 € = 886,10 €.
      const engine = setup({
        positions: [{ depotId: DEPOT, instrumentId: STOCK_ID, quantity: 10 * SHARE }],
        prices: {
          [STOCK]: [
            { tick: 0, price: 100 },
            { tick: at(TUE, 9), price: 90 },
          ],
        },
      });
      expect(
        place(engine, { side: 'sell', type: 'stop', stop: 95, validity: { kind: 'gtc' } }).ok,
      ).toBe(true);
      engine.runUntil(at(TUE, 8, 59));
      expect(order(engine, 'ord-1').status).toBe('open');
      engine.runUntil(at(TUE, 10));
      expect(order(engine, 'ord-1')).toMatchObject({
        status: 'executed',
        triggeredAt: at(TUE, 9),
        execution: { tick: at(TUE, 9), price: 89.91, total: 88_610 },
      });
      expect(orderEvents(engine.drainEvents())).toEqual([
        ['order-triggered', at(TUE, 9)],
        ['order-executed', at(TUE, 9)],
      ]);
      expect(balance(engine)).toBe(500_000 + 88_610);
    });

    it('triggers a stop-limit sale at a gap without executing it; it expires with its validity', () => {
      const engine = setup({
        positions: [{ depotId: DEPOT, instrumentId: STOCK_ID, quantity: 10 * SHARE }],
        prices: {
          [STOCK]: [
            { tick: 0, price: 100 },
            { tick: at(TUE, 9), price: 90 },
          ],
        },
      });
      const validity = { kind: 'date', date: { year: 2030, month: 4, day: TUE } } as const;
      expect(
        place(engine, { side: 'sell', type: 'stop-limit', stop: 95, limit: 94, validity }).ok,
      ).toBe(true);
      engine.runUntil(at(TUE, 23, 59));
      expect(order(engine, 'ord-1')).toMatchObject({
        status: 'triggered',
        triggeredAt: at(TUE, 9),
      });
      expect(place(engine, { side: 'sell', type: 'limit', limit: 200 })).toEqual({
        ok: false,
        error: 'insufficient-quantity',
      });
      engine.runUntil(at(WED, 1));
      expect(order(engine, 'ord-1')).toMatchObject({
        status: 'expired',
        triggeredAt: at(TUE, 9),
        closedAt: at(WED),
      });
      expect(orderEvents(engine.drainEvents())).toEqual([
        ['order-triggered', at(TUE, 9)],
        ['order-expired', at(WED)],
      ]);
      expect(engine.drainNotifications()).toEqual([
        expect.objectContaining({
          tick: at(WED),
          code: 'order-expired',
          params: { orderId: 'ord-1', depotId: DEPOT, instrumentId: STOCK_ID, side: 'sell' },
        }),
      ]);
      expect(place(engine, { side: 'sell', type: 'limit', limit: 200 }).ok).toBe(true);
    });

    it('executes a stop buy as market and a stop-limit buy once the ask is back within the limit', () => {
      // 12:00 mid 101,50 → ask 101,61 €: stop 101 executes (5 × 101,61 = 508,05 € + 13,00 €),
      // stop-limit 101 / 101,50 triggers; 13:00 ask 101,41 €: 507,05 € + 13,00 €.
      const engine = setup({
        prices: {
          [STOCK]: [
            { tick: 0, price: 100 },
            { tick: at(MON, 12), price: 101.5 },
            { tick: at(MON, 13), price: 101.3 },
          ],
        },
      });
      expect(place(engine, { type: 'stop', stop: 101, ...shares(5 * SHARE) }).ok).toBe(true);
      expect(
        place(engine, { type: 'stop-limit', stop: 101, limit: 101.5, ...shares(5 * SHARE) }).ok,
      ).toBe(true);
      // Stop: 5 × 101,00 = 505,00 € + 25,25 € + 13,00 €; stop-limit: 507,50 € + 13,00 €.
      expect(engine.player.orders.map(({ reserved }) => reserved)).toEqual([54_325, 52_050]);
      engine.runUntil(at(MON, 14));
      expect(order(engine, 'ord-1')).toMatchObject({
        triggeredAt: at(MON, 12),
        execution: { tick: at(MON, 12), price: 101.61, total: 52_105 },
      });
      expect(order(engine, 'ord-2')).toMatchObject({
        triggeredAt: at(MON, 12),
        execution: { tick: at(MON, 13), price: 101.41, total: 52_005 },
      });
      expect(orderEvents(engine.drainEvents())).toEqual([
        ['order-triggered', at(MON, 12)],
        ['order-executed', at(MON, 12)],
        ['order-triggered', at(MON, 12)],
        ['order-executed', at(MON, 13)],
      ]);
    });

    it('does not check orders in the closing minute', () => {
      const engine = setup({
        prices: {
          [STOCK]: [
            { tick: 0, price: 100 },
            { tick: at(MON, 17, 30), price: 90 },
          ],
        },
      });
      expect(place(engine, { type: 'limit', limit: 95, validity: { kind: 'gtc' } }).ok).toBe(true);
      engine.runUntil(at(MON, 17, 31));
      expect(order(engine, 'ord-1').status).toBe('open');
      engine.runUntil(at(TUE, 9));
      expect(order(engine, 'ord-1').execution).toMatchObject({ tick: at(TUE, 9) });
    });

    it('lets a day order run until the close of today, or of the next day after hours', () => {
      const engine = setup({ prices: { [STOCK]: [{ tick: 0, price: 100 }] } });
      expect(place(engine, { type: 'limit', limit: 50 }).ok).toBe(true);
      expect(order(engine, 'ord-1').expiresAt).toBe(at(MON, 17, 30));
      engine.runUntil(at(MON, 23));
      expect(order(engine, 'ord-1')).toMatchObject({
        status: 'expired',
        closedAt: at(MON, 17, 30),
      });
      expect(place(engine, { type: 'limit', limit: 50 }).ok).toBe(true);
      engine.runUntil(at(TUE, 17, 29));
      expect(order(engine, 'ord-2').status).toBe('open');
      engine.runUntil(at(TUE, 17, 30));
      expect(order(engine, 'ord-2')).toMatchObject({
        status: 'expired',
        closedAt: at(TUE, 17, 30),
      });
      expect(available(engine)).toBe(500_000);
    });
  });

  describe('US-HD-04: order book', () => {
    it('cancels open and triggered orders and refuses closed and unknown ones', () => {
      const engine = setup({
        positions: [{ depotId: DEPOT, instrumentId: STOCK_ID, quantity: 10 * SHARE }],
        prices: {
          [STOCK]: [
            { tick: 0, price: 100 },
            { tick: at(TUE, 9), price: 90 },
          ],
        },
      });
      expect(place(engine, { type: 'limit', limit: 99 }).ok).toBe(true);
      expect(
        place(engine, {
          side: 'sell',
          type: 'stop-limit',
          stop: 95,
          limit: 94,
          validity: { kind: 'gtc' },
        }).ok,
      ).toBe(true);
      expect(cancel(engine, 'ord-1')).toEqual({ ok: true });
      expect(order(engine, 'ord-1')).toMatchObject({ status: 'cancelled', closedAt: at(MON, 10) });
      expect(available(engine)).toBe(500_000);
      engine.runUntil(at(TUE, 10));
      expect(order(engine, 'ord-2').status).toBe('triggered');
      expect(change(engine, 'ord-2', { stop: 92 })).toEqual({ ok: false, error: 'stop-triggered' });
      expect(cancel(engine, 'ord-2')).toEqual({ ok: true });
      expect(order(engine, 'ord-2')).toMatchObject({ status: 'cancelled', closedAt: at(TUE, 10) });
      expect(cancel(engine, 'ord-2')).toEqual({ ok: false, error: 'order-not-active' });
      expect(change(engine, 'ord-1', { limit: 98 })).toEqual({
        ok: false,
        error: 'order-not-active',
      });
      expect(cancel(engine, 'ord-9')).toEqual({ ok: false, error: 'unknown-order' });
      expect(apply(engine, { type: 'cancelOrder', orderId: 7 } as never)).toEqual({
        ok: false,
        error: 'invalid-command',
      });
      expect(engine.player.orders).toEqual([]);
      expect(engine.player.orderHistory.map(({ id }) => id)).toEqual(['ord-1', 'ord-2']);
    });

    it('changes limit and validity, re-reserves and executes a marketable change at once', () => {
      // Limit 99 → 100: reservation 1.003,00 → 1.013,00 €; free 1.500,00 − 1.013,00 = 487,00 €.
      // Limit 150 reserves 1.513,00 € (+500,00 €), limit 148 1.493,00 € (+480,00 €).
      const engine = setup({ balance: 150_000, prices: { [STOCK]: [{ tick: 0, price: 100 }] } });
      expect(place(engine, { type: 'limit', limit: 99, validity: { kind: 'gtc' } }).ok).toBe(true);
      expect(change(engine, 'ord-1', { limit: 100 })).toEqual({ ok: true });
      expect(order(engine, 'ord-1')).toMatchObject({
        status: 'open',
        limit: 100,
        reserved: 101_300,
      });
      expect(change(engine, 'ord-1', { limit: 150 })).toEqual({
        ok: false,
        error: 'insufficient-funds',
      });
      expect(change(engine, 'ord-1', { stop: 90 })).toEqual({ ok: false, error: 'invalid-stop' });
      expect(change(engine, 'ord-1', { limit: '150' } as never)).toEqual({
        ok: false,
        error: 'invalid-command',
      });
      expect(change(engine, 'ord-1', { validity: { kind: 'day' } })).toEqual({ ok: true });
      expect(order(engine, 'ord-1').expiresAt).toBe(at(MON, 17, 30));
      expect(change(engine, 'ord-1', { limit: 148 })).toEqual({ ok: true });
      expect(order(engine, 'ord-1')).toMatchObject({
        status: 'executed',
        limit: 148,
        execution: { tick: at(MON, 10), price: 100.1, total: 101_400 },
      });
      expect(change(engine, 'ord-7', { limit: 1 })).toEqual({ ok: false, error: 'unknown-order' });
    });

    it('expires an order at its new validity and ignores the old expiry', () => {
      const engine = setup({ prices: { [STOCK]: [{ tick: 0, price: 100 }] } });
      expect(place(engine, { type: 'limit', limit: 50 }).ok).toBe(true);
      engine.runUntil(at(MON, 12));
      const tuesday = { kind: 'date', date: { year: 2030, month: 4, day: TUE } } as const;
      expect(change(engine, 'ord-1', { validity: tuesday })).toEqual({ ok: true });
      engine.runUntil(at(TUE, 23, 59));
      expect(order(engine, 'ord-1').status).toBe('open');
      engine.runUntil(at(WED));
      expect(order(engine, 'ord-1')).toMatchObject({ status: 'expired', closedAt: at(WED) });
      expect(orderEvents(engine.drainEvents())).toEqual([['order-expired', at(WED)]]);
    });

    it('reports placed, triggered, changed and closed orders and their clearing account', () => {
      const engine = setup({
        prices: {
          [STOCK]: [
            { tick: 0, price: 100 },
            { tick: at(MON, 12), price: 101.5 },
          ],
        },
      });
      engine.drainChangedOrders();
      expect(place(engine, { type: 'limit', limit: 50 }).ok).toBe(true);
      expect(place(engine, { type: 'stop-limit', stop: 101, limit: 50 }).ok).toBe(true);
      expect(engine.drainChangedOrders()).toEqual(['ord-1', 'ord-2']);
      expect(engine.drainChangedAccounts()).toEqual([CLEARING]);
      expect(change(engine, 'ord-1', { limit: 60 })).toEqual({ ok: true });
      expect(engine.drainChangedOrders()).toEqual(['ord-1']);
      expect(engine.drainChangedAccounts()).toEqual([CLEARING]);
      engine.runUntil(at(MON, 12));
      expect(engine.drainChangedOrders()).toEqual(['ord-2']);
      expect(cancel(engine, 'ord-2')).toEqual({ ok: true });
      expect(engine.drainChangedOrders()).toEqual(['ord-2']);
      expect(engine.drainChangedAccounts()).toEqual([CLEARING]);
      expect(engine.drainChangedDepots()).toEqual([]);
    });

    it('acts on the order with the given ID among several', () => {
      const engine = setup({ prices: { [STOCK]: [{ tick: 0, price: 100 }] } });
      expect(place(engine, { type: 'limit', limit: 51, validity: { kind: 'gtc' } }).ok).toBe(true);
      expect(place(engine, { type: 'limit', limit: 50 }).ok).toBe(true);
      expect(place(engine, { type: 'limit', limit: 52, validity: { kind: 'gtc' } }).ok).toBe(true);
      expect(change(engine, 'ord-1', { limit: 55 })).toEqual({ ok: true });
      expect(cancel(engine, 'ord-3')).toEqual({ ok: true });
      engine.runUntil(at(MON, 17, 30));
      expect(engine.player.orders.map(({ id, limit }) => [id, limit])).toEqual([['ord-1', 55]]);
      expect(engine.player.orderHistory.map(({ id, status }) => [id, status])).toEqual([
        ['ord-3', 'cancelled'],
        ['ord-2', 'expired'],
      ]);
      expect(apply(engine, { type: 'changeOrder', orderId: 2, change: {} } as never)).toEqual({
        ok: false,
        error: 'invalid-command',
      });
    });

    it('keeps active and closed orders in the snapshot', () => {
      const engine = setup({ prices: { [STOCK]: [{ tick: 0, price: 99.9 }] } });
      expect(place(engine, { type: 'limit', limit: 50, validity: { kind: 'gtc' } }).ok).toBe(true);
      expect(place(engine).ok).toBe(true);
      const snapshot = engine.snapshot();
      expect(snapshot.player.orders).toEqual(engine.player.orders);
      expect(snapshot.player.orderHistory).toEqual(engine.player.orderHistory);
      expect(snapshot.player.orderHistory[0].execution).toMatchObject({ total: 101_300 });
      expect(snapshot.player.positions).toEqual(engine.player.positions);
      const restored = GameEngine.restore(world, snapshot, {
        monthStarts,
        prices: () => new TestMarket([[{ tick: 0, price: 99.9 }]], 0.002),
      });
      expect(cancel(restored, 'ord-1')).toEqual({ ok: true });
      expect(engine.player.orders.map(({ status }) => status)).toEqual(['open']);
    });

    it('marks the clearing account only for orders that reserve money', () => {
      const engine = setup({
        positions: [{ depotId: DEPOT, instrumentId: STOCK_ID, quantity: 10 * SHARE }],
        prices: { [STOCK]: [{ tick: 0, price: 100 }] },
      });
      expect(place(engine, { side: 'sell', type: 'limit', limit: 200 }).ok).toBe(true);
      expect(cancel(engine, 'ord-1')).toEqual({ ok: true });
      expect(engine.drainChangedAccounts()).toEqual([]);
      expect(engine.drainChangedOrders()).toEqual(['ord-1']);
    });

    it('keeps the newest closed orders only', () => {
      const engine = setup({ prices: { [STOCK]: [{ tick: 0, price: 100 }] } });
      for (let n = 1; n <= 501; n++) {
        place(engine, { type: 'limit', limit: 50 });
        cancel(engine, `ord-${n}`);
      }
      const history = engine.player.orderHistory;
      expect(history).toHaveLength(500);
      expect([history[0].id, history[499].id]).toEqual(['ord-2', 'ord-501']);
      expect(cancel(engine, 'ord-1')).toEqual({ ok: false, error: 'unknown-order' });
    });

    it('keeps a depot with positions or active orders from closing', () => {
      const engine = setup({
        positions: [{ depotId: DEPOT, instrumentId: STOCK_ID, quantity: SHARE }],
        prices: { [STOCK]: [{ tick: 0, price: 100 }] },
      });
      const close = (): CommandResult =>
        apply(engine, { type: 'closeAccount', accountId: CLEARING, targetAccountId: 'acc-1' });
      expect(close()).toEqual({ ok: false, error: 'depot-not-empty' });
      expect(place(engine, { side: 'sell', ...shares(SHARE) }).ok).toBe(true);
      expect(engine.player.positions).toEqual([]);
      expect(place(engine, { type: 'limit', limit: 50 }).ok).toBe(true);
      expect(close()).toEqual({ ok: false, error: 'depot-not-empty' });
      expect(cancel(engine, 'ord-2')).toEqual({ ok: true });
      expect(close()).toEqual({ ok: true });
    });
  });

  it('leaves the market checksum unchanged by orders', () => {
    const mini = miniGame(TEST_SEEDS.mini);
    const bankId = mini.world.world.banks[0].id;
    const end = at(12);
    const run = (withOrders: boolean): string => {
      const state = withBooks(mini.start, {
        accounts: [{ kind: 'clearing', bankId, balance: 100_000_000 }],
      });
      const engine = GameEngine.restore(mini.world, state, { monthStarts: mini.monthStarts });
      engine.runUntil(at(MON, 8));
      if (withOrders) {
        const { companies, etfs } = mini.world.world;
        const ids = [...companies.slice(0, 15).map(({ id }) => id), etfs[0].id, etfs[1].id];
        ids.forEach((instrumentId, n) => {
          const spec: OrderSpec = {
            ...MARKET_BUY,
            instrumentId,
            type: n % 3 === 0 ? 'market' : 'limit',
            limit: n % 3 === 0 ? null : 1,
            validity: { kind: 'gtc' },
          };
          expect(
            engine.applyCommand({ id: `o${n}`, tick: engine.tick, type: 'placeOrder', order: spec })
              .ok,
          ).toBe(true);
        });
      }
      engine.runUntil(end);
      if (withOrders) {
        expect(engine.player.orderHistory.length).toBeGreaterThan(0);
        expect(engine.player.orders.length).toBeGreaterThan(0);
      }
      return marketChecksum(engine.snapshot().market);
    };
    expect(run(true)).toBe(run(false));
  });
});
