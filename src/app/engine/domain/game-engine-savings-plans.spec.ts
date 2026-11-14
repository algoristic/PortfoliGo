import { AccountId } from '@app/banking/domain/models/account.model';
import { DepotConditions } from '@app/banking/domain/models/bank-conditions.model';
import { Transaction } from '@app/banking/domain/models/ledger.model';
import { dateTimeToTick } from '@app/clock/domain/calendar-logic';
import { Tick } from '@app/clock/domain/models/time.model';
import { Cents } from '@app/shared/domain/models/money.model';
import { Order } from '@app/trading/domain/models/order.model';
import { SavingsPlanSpec } from '@app/trading/domain/models/savings-plan.model';
import { Bank } from '@app/world/domain/models/bank.model';
import { miniWorld } from '@app/world/domain/testing/mini-world';

import { accountViews } from './account-projection';
import { GameEngine } from './game-engine';
import { createGameWorld } from './game-world';
import { CommandResult, GameCommand } from './models/engine-command.model';
import { EngineEvent } from './models/engine-event.model';
import { GameSnapshot, GameState, StartConditions } from './models/game-state.model';
import { GameWorld } from './models/game-world.model';
import { startBankingGame, TEST_BANKS, withBooks } from './testing/banking-game';
import { TestMarket, TestPrice } from './testing/test-market';

import { TEST_SEEDS } from '../../../testing/seeds';

// Savings plans in the engine (US-HD-05, TS §7.8, AP 5.6b) against the test market: the ETF
// `etf-0001` trades on `exc-de` (09:00–17:30); mid 119,88 € gives the ask 120,00 € (spread 0,2 %,
// no venue mark-up). The broker `bs` charges 1,5 % savings plan costs, so 50,00 € buy
// (50,00 − 0,75) / 120,00 = 0,410416 shares for 49,25 € (TS §7.8 table). The salary account `acc-1`
// at the home bank `b1` holds the start capital; every player opens a depot `dep-3` at `bs` with
// the clearing account `acc-2`. Execution days come from the calendar of 2030.

const DEPOT = 'dep-3';
const CLEARING: AccountId = 'acc-2';
const ASK_120 = 119.88;

function at(day: number, month: number, hour = 0, minute = 0): Tick {
  return dateTimeToTick({ year: 2030, month, day, hour, minute });
}

const SAVINGS_DEPOT: DepotConditions = {
  custodyFee: { kind: 'none' },
  orderFee: { kind: 'flat', amount: 490 },
  exchangeFee: 0,
  savingsPlanFee: { kind: 'percent', rate: 0.015 },
  clearingAccountRate: 0,
  clearingAccountDebitRate: 0,
  venue: 'exchange',
  spreadMarkup: 0,
  fractionalShares: false,
};

const BANKS: readonly Bank[] = [
  ...TEST_BANKS,
  {
    id: 'bs',
    name: 'Sparbroker',
    type: 'online-broker',
    conditions: { currentAccount: null, savingsAccount: null, depot: SAVINGS_DEPOT },
  },
];

const FUNDED: StartConditions = {
  startCapital: 1_000_000,
  netIncome: 250_000,
  livingCosts: 180_000,
};

type WithoutStamp<T> = T extends unknown ? Omit<T, 'id' | 'tick'> : never;
type Body = WithoutStamp<GameCommand>;

interface Setup {
  balance?: Cents;
  /** Prices of the ETF from the given ticks on; 119,88 € (ask 120,00 €) by default. */
  prices?: readonly TestPrice[];
}

describe('GameEngine savings plans', () => {
  let world: GameWorld;
  let start: GameSnapshot;
  let monthStarts: ReturnType<GameEngine['monthStartsAfter']>;
  let etfId: string;
  let etf: number;
  let indexId: string;
  let ineligibleStockId: string | undefined;
  let nextId: number;

  beforeAll(() => {
    const { seedKey, world: mini } = miniWorld(TEST_SEEDS.mini);
    const engine = startBankingGame(createGameWorld(seedKey, mini), FUNDED);
    world = { ...engine.world, world: { ...engine.world.world, banks: BANKS } };
    start = engine.snapshot();
    engine.runUntil(at(1, 8));
    monthStarts = engine.monthStartsAfter(-1);
    const { context } = world;
    etfId = context.etfs.ids[0];
    etf = context.layout.instrumentIds.length + 2 * context.indices.ids.length;
    indexId = context.indices.ids[0];
    ineligibleStockId = mini.companies.find((company) => !company.savingsPlanEligible)?.id;
  });

  beforeEach(() => {
    nextId = 1;
  });

  function plan(amount: Cents, day: number): SavingsPlanSpec {
    return { depotId: DEPOT, instrumentId: etfId, amount, day };
  }

  /** The funded game at 01.04.2030 00:00 with the depot `dep-3` holding `balance` on `acc-2`. */
  function setup({ balance = 100_000, prices = [{ tick: 0, price: ASK_120 }] }: Setup = {}) {
    const state = withBooks(start, {
      accounts: [{ kind: 'clearing', bankId: 'bs', balance }],
    }) as GameState;
    return restore(state, prices);
  }

  function restore(state: GameSnapshot, prices: readonly TestPrice[]): GameEngine {
    const series: TestPrice[][] = [];
    series[etf] = [...prices];
    const engine = GameEngine.restore(world, state, {
      monthStarts,
      prices: () => new TestMarket(series, 0.002),
    });
    drain(engine);
    return engine;
  }

  function drain(engine: GameEngine): void {
    engine.drainEvents();
    engine.drainTransactions();
    engine.drainNotifications();
    engine.drainChangedAccounts();
    engine.drainChangedDepots();
  }

  function apply(engine: GameEngine, body: Body): CommandResult {
    return engine.applyCommand({ ...body, id: `c${nextId++}`, tick: engine.tick } as GameCommand);
  }

  function ok(engine: GameEngine, body: Body): CommandResult {
    const result = apply(engine, body);
    expect(result).toMatchObject({ ok: true });
    return result;
  }

  function create(engine: GameEngine, spec: SavingsPlanSpec): CommandResult {
    return ok(engine, { type: 'createSavingsPlan', plan: spec });
  }

  function next(engine: GameEngine): (Tick | null)[] {
    return engine.savingsPlanViews().map(({ nextExecution }) => nextExecution);
  }

  /** Purchases of savings plans: tick, plan, postings and shares. */
  function purchases(transactions: readonly Transaction[]): unknown[][] {
    return transactions
      .filter(({ refs }) => refs?.['savingsPlanId'] !== undefined)
      .map(({ tick, refs, postings, units }) => [
        tick,
        refs?.['savingsPlanId'],
        postings.map(({ account, amount }) => [account, amount]),
        units?.[0]?.quantity,
      ]);
  }

  function savingsPlanEvents(events: readonly EngineEvent[]): EngineEvent[] {
    return events.filter(({ type }) => type.startsWith('savings-plan-'));
  }

  function balance(engine: GameEngine, id: AccountId = CLEARING): Cents {
    return engine.player.balances.get(id) ?? 0;
  }

  function savingsPlanTasks(engine: GameEngine): Tick[] {
    return engine
      .snapshot()
      .scheduler.heap.filter(({ kind }) => kind === 'savings-plan')
      .map(({ tick }) => tick);
  }

  describe('US-HD-05: execution days', () => {
    // TS §7.8: at the open of the exchange on the day, at the ask, fractions on millionths
    it('buys fractions at the open of its day for the amount minus the costs', () => {
      const engine = setup();
      expect(create(engine, plan(5_000, 15))).toEqual({ ok: true, savingsPlanId: 'sp-1' });
      expect(next(engine)).toEqual([at(15, 4, 9)]);
      expect(savingsPlanTasks(engine)).toEqual([at(15, 4, 9)]);
      engine.runUntil(at(15, 4, 8, 59));
      expect(purchases(engine.drainTransactions())).toEqual([]);
      engine.runUntil(at(15, 4, 9));
      const transactions = engine.drainTransactions();
      // TS §7.8: 0,75 € costs, 0,410416 shares for 49,25 €, debit 50,00 €.
      expect(purchases(transactions)).toEqual([
        [
          at(15, 4, 9),
          'sp-1',
          [
            [CLEARING, -5_000],
            ['external:market', 4_925],
            ['external:bank:bs:fees', 75],
          ],
          410_416,
        ],
      ]);
      expect(transactions.find(({ refs }) => refs?.['savingsPlanId'])?.type).toBe('buy');
      expect(balance(engine)).toBe(95_000);
      expect(engine.player.positions).toEqual([
        {
          depotId: DEPOT,
          instrumentId: etfId,
          quantity: 410_416,
          lots: [{ buyTick: at(15, 4, 9), quantity: 410_416, cost: 5_000 }],
          realizedGain: 0,
          distributions: 0,
        },
      ]);
      expect(savingsPlanEvents(engine.drainEvents())).toEqual([
        {
          type: 'savings-plan-executed',
          tick: at(15, 4, 9),
          savingsPlanId: 'sp-1',
          depotId: DEPOT,
          instrumentId: etfId,
          amount: 5_000,
          quantity: 410_416,
          price: 120,
          total: 5_000,
        },
      ]);
      expect(engine.drainNotifications().map(({ code }) => code)).toEqual([
        'savings-plan-executed',
      ]);
      expect(engine.drainChangedDepots()).toEqual([DEPOT]);
      // TS §7.7: no tax on a purchase.
      expect(engine.player.taxYear.paid).toBe(0);
      // Wednesday, 15.05.2030; the plan's month is done.
      expect(next(engine)).toEqual([at(15, 5, 9)]);
      expect(engine.player.savingsPlans[0].handledUpTo).toBe('2030-04');
      engine.runUntil(at(15, 5, 9));
      expect(purchases(engine.drainTransactions()).map(([tick]) => tick)).toEqual([at(15, 5, 9)]);
    });

    // TS §7.8: a day without trading moves to the next trading day of the exchange
    it('moves weekend days to the next trading day', () => {
      const engine = setup({ balance: 1_000_000 });
      create(engine, plan(5_000, 6));
      create(engine, plan(5_000, 15));
      // Saturday 06.04. → Monday 08.04.; Saturday 15.06. → Monday 17.06.
      expect(next(engine)).toEqual([at(8, 4, 9), at(15, 4, 9)]);
      engine.runUntil(at(30, 6));
      expect(purchases(engine.drainTransactions()).map(([tick, id]) => [tick, id])).toEqual([
        [at(8, 4, 9), 'sp-1'],
        [at(15, 4, 9), 'sp-2'],
        [at(6, 5, 9), 'sp-1'],
        [at(15, 5, 9), 'sp-2'],
        [at(6, 6, 9), 'sp-1'],
        [at(17, 6, 9), 'sp-2'],
      ]);
      expect(savingsPlanTasks(engine)).toEqual([at(8, 7, 9)]);
    });

    it('executes a plan created on its day before the open the same day, after it next month', () => {
      const engine = setup();
      engine.runUntil(at(15, 4, 8, 59));
      drain(engine);
      create(engine, plan(5_000, 15));
      expect(next(engine)).toEqual([at(15, 4, 9)]);
      engine.runUntil(at(15, 4, 9));
      create(engine, plan(5_000, 15));
      expect(next(engine)).toEqual([at(15, 5, 9), at(15, 5, 9)]);
    });
  });

  describe('several plans and the standing order', () => {
    // TS §7.8: in creation order; each sees the bookings of the ones before
    it('executes plans of the same tick in creation order until the money runs out', () => {
      const engine = setup({ balance: 8_000 });
      create(engine, plan(5_000, 15));
      create(engine, plan(5_000, 15));
      create(engine, plan(2_000, 15));
      engine.runUntil(at(15, 4, 9));
      expect(purchases(engine.drainTransactions()).map(([, id]) => id)).toEqual(['sp-1', 'sp-3']);
      // 80,00 € − 50,00 € = 30,00 € are left for the second plan.
      expect(savingsPlanEvents(engine.drainEvents()).map((event) => [event.type, event])).toEqual([
        ['savings-plan-executed', expect.objectContaining({ savingsPlanId: 'sp-1' })],
        [
          'savings-plan-failed',
          expect.objectContaining({
            savingsPlanId: 'sp-2',
            reason: 'insufficient-funds',
            available: 3_000,
            amount: 5_000,
          }),
        ],
        ['savings-plan-executed', expect.objectContaining({ savingsPlanId: 'sp-3' })],
      ]);
      expect(balance(engine)).toBe(1_000);
      expect(engine.player.savingsPlans.map(({ handledUpTo }) => handledUpTo)).toEqual([
        '2030-04',
        '2030-04',
        '2030-04',
      ]);
    });

    // TS §7.4, §7.8: the standing order at 06:00 covers a plan at an exchange that opens later
    it('buys with the money a standing order transferred at 06:00 of the same day', () => {
      const engine = setup({ balance: 0 });
      ok(engine, {
        type: 'createStandingOrder',
        order: {
          fromAccountId: 'acc-1',
          toAccountId: CLEARING,
          amount: 5_000,
          day: 15,
          purpose: '',
        },
      });
      create(engine, plan(5_000, 15));
      engine.runUntil(at(15, 4, 9));
      const transactions = engine.drainTransactions();
      expect(
        transactions
          .filter(({ refs }) => refs?.['standingOrderId'] ?? refs?.['savingsPlanId'])
          .map(({ tick, type, refs }) => [tick, type, refs]),
      ).toEqual([
        [at(15, 4, 6), 'transfer', { standingOrderId: 'so-1' }],
        [at(15, 4, 9), 'buy', { savingsPlanId: 'sp-1', instrumentId: etfId }],
      ]);
      expect(balance(engine)).toBe(0);
    });
  });

  describe('failures', () => {
    // TS §7.8: no cover, nothing booked, the month is done
    it('fails without cover, notifies and goes on next month', () => {
      const engine = setup({ balance: 4_999 });
      create(engine, plan(5_000, 15));
      engine.runUntil(at(15, 4, 9));
      expect(purchases(engine.drainTransactions())).toEqual([]);
      expect(savingsPlanEvents(engine.drainEvents())).toEqual([
        {
          type: 'savings-plan-failed',
          tick: at(15, 4, 9),
          savingsPlanId: 'sp-1',
          depotId: DEPOT,
          instrumentId: etfId,
          amount: 5_000,
          reason: 'insufficient-funds',
          available: 4_999,
        },
      ]);
      expect(engine.drainNotifications()).toEqual([
        expect.objectContaining({
          code: 'savings-plan-failed',
          tick: at(15, 4, 9),
          params: {
            savingsPlanId: 'sp-1',
            depotId: DEPOT,
            instrumentId: etfId,
            amount: 5_000,
            reason: 'insufficient-funds',
            available: 4_999,
          },
        }),
      ]);
      expect(engine.player.positions).toEqual([]);
      expect(next(engine)).toEqual([at(15, 5, 9)]);
    });

    // TS §7.5, §7.8: reservations of open buy orders lower the available amount
    it('counts the reservations of open buy orders', () => {
      const opening = setup({ balance: 10_000 });
      const state = structuredClone(opening.snapshot()) as GameState;
      state.player.orders = [
        {
          id: 'ord-1',
          depotId: DEPOT,
          instrumentId: etfId,
          side: 'buy',
          type: 'limit',
          size: { kind: 'quantity', quantity: 1_000_000 },
          limit: 0.01,
          stop: null,
          validity: { kind: 'gtc' },
          status: 'open',
          placedAt: state.tick,
          expiresAt: at(1, 4) + 1_000_000,
          reserved: 6_000,
          triggeredAt: null,
          execution: null,
          closedAt: null,
          rejection: null,
        } satisfies Order,
      ];
      state.player.orderSequence = 1;
      const engine = restore(state, [{ tick: 0, price: ASK_120 }]);
      create(engine, plan(5_000, 15));
      // 100,00 € − 60,00 € reserved = 40,00 €.
      expect(accountViews(engine.player, [CLEARING])[0].available).toBe(4_000);
      engine.runUntil(at(15, 4, 9));
      expect(savingsPlanEvents(engine.drainEvents())).toEqual([
        expect.objectContaining({ reason: 'insufficient-funds', available: 4_000 }),
      ]);
      expect(balance(engine)).toBe(10_000);
    });

    // E-22: no purchase at the price floor
    it('fails at the price floor', () => {
      const engine = setup({ prices: [{ tick: 0, price: 0.01 }] });
      create(engine, plan(5_000, 15));
      engine.runUntil(at(15, 4, 9));
      expect(savingsPlanEvents(engine.drainEvents())).toEqual([
        expect.objectContaining({ type: 'savings-plan-failed', reason: 'price-floor' }),
      ]);
      expect(balance(engine)).toBe(100_000);
    });

    it('fails when the amount after costs buys not a millionth', () => {
      // 1,00 € − 0,02 € costs = 0,98 € at an ask of about 2 Mio. € buys nothing.
      const engine = setup({ prices: [{ tick: 0, price: 2_000_000 }] });
      create(engine, plan(100, 15));
      engine.runUntil(at(15, 4, 9));
      expect(savingsPlanEvents(engine.drainEvents())).toEqual([
        expect.objectContaining({ type: 'savings-plan-failed', reason: 'amount-too-small' }),
      ]);
    });
  });

  describe('commands', () => {
    it.each<
      [string, (ids: { etfId: string; indexId: string }) => Partial<SavingsPlanSpec>, string]
    >([
      ['an unknown depot', () => ({ depotId: 'dep-9' }), 'unknown-depot'],
      ['an unknown instrument', () => ({ instrumentId: 'xyz' }), 'unknown-instrument'],
      ['an index', ({ indexId: id }) => ({ instrumentId: id }), 'not-savings-plan-eligible'],
      ['0,99 €', () => ({ amount: 99 }), 'amount-too-small'],
      ['0 cents', () => ({ amount: 0 }), 'invalid-amount'],
      ['day 29', () => ({ day: 29 }), 'invalid-day'],
    ])('refuses %s', (_name, change, error) => {
      const engine = setup();
      expect(
        apply(engine, {
          type: 'createSavingsPlan',
          plan: { ...plan(5_000, 15), ...change({ etfId, indexId }) },
        }),
      ).toEqual({ ok: false, error });
      expect(engine.player.savingsPlans).toEqual([]);
      expect(savingsPlanTasks(engine)).toEqual([]);
    });

    it('refuses shares that are not savings-plan-eligible', () => {
      expect(ineligibleStockId).toBeDefined();
      const engine = setup();
      expect(
        apply(engine, {
          type: 'createSavingsPlan',
          plan: { ...plan(5_000, 15), instrumentId: ineligibleStockId as string },
        }),
      ).toEqual({ ok: false, error: 'not-savings-plan-eligible' });
    });

    it('refuses mistyped commands and unknown IDs', () => {
      const engine = setup();
      expect(
        apply(engine, {
          type: 'createSavingsPlan',
          plan: { depotId: DEPOT } as unknown as SavingsPlanSpec,
        }),
      ).toEqual({ ok: false, error: 'invalid-command' });
      expect(
        apply(engine, {
          type: 'changeSavingsPlan',
          savingsPlanId: 'sp-1',
          change: { amount: 1, day: 1 },
        }),
      ).toEqual({ ok: false, error: 'unknown-savings-plan' });
      expect(apply(engine, { type: 'deleteSavingsPlan', savingsPlanId: 'sp-1' })).toEqual({
        ok: false,
        error: 'unknown-savings-plan',
      });
      expect(
        apply(engine, { type: 'setSavingsPlanPaused', savingsPlanId: 'sp-1', paused: true }),
      ).toEqual({ ok: false, error: 'unknown-savings-plan' });
    });

    // TS §7.8: a paused plan skips its dates; resuming does not make them up
    it('pauses and resumes without making up missed months', () => {
      const engine = setup();
      create(engine, plan(5_000, 15));
      ok(engine, { type: 'setSavingsPlanPaused', savingsPlanId: 'sp-1', paused: true });
      expect(next(engine)).toEqual([null]);
      expect(savingsPlanTasks(engine)).toEqual([]);
      engine.runUntil(at(20, 5));
      expect(purchases(engine.drainTransactions())).toEqual([]);
      ok(engine, { type: 'setSavingsPlanPaused', savingsPlanId: 'sp-1', paused: false });
      // April and May are not made up.
      expect(engine.player.savingsPlans[0].handledUpTo).toBe('2030-05');
      expect(next(engine)).toEqual([at(17, 6, 9)]);
      expect(savingsPlanTasks(engine)).toEqual([at(17, 6, 9)]);
    });

    // TS §7.8: a change keeps months done and a passed new day waits for next month
    it('changes amount and day without executing a month twice', () => {
      const engine = setup();
      create(engine, plan(5_000, 15));
      engine.runUntil(at(15, 4, 12));
      drain(engine);
      // The 20th lies ahead, but April is done already.
      ok(engine, {
        type: 'changeSavingsPlan',
        savingsPlanId: 'sp-1',
        change: { amount: 2_500, day: 20 },
      });
      expect(engine.player.savingsPlans[0]).toMatchObject({
        amount: 2_500,
        day: 20,
        depotId: DEPOT,
        instrumentId: etfId,
        handledUpTo: '2030-04',
      });
      // Monday, 20.05.2030
      expect(next(engine)).toEqual([at(20, 5, 9)]);
      expect(
        apply(engine, {
          type: 'changeSavingsPlan',
          savingsPlanId: 'sp-1',
          change: { amount: 2_500, day: 0 },
        }),
      ).toEqual({ ok: false, error: 'invalid-day' });
    });

    it('deletes a plan and its schedule', () => {
      const engine = setup();
      create(engine, plan(5_000, 15));
      ok(engine, { type: 'deleteSavingsPlan', savingsPlanId: 'sp-1' });
      expect(engine.player.savingsPlans).toEqual([]);
      expect(savingsPlanTasks(engine)).toEqual([]);
      engine.runUntil(at(16, 4));
      expect(purchases(engine.drainTransactions())).toEqual([]);
      expect(create(engine, plan(5_000, 15))).toEqual({ ok: true, savingsPlanId: 'sp-2' });
    });

    // TS §7.4: a depot with savings plans, paused ones too, cannot close
    it('keeps a depot with savings plans open', () => {
      const engine = setup();
      create(engine, plan(5_000, 15));
      ok(engine, { type: 'setSavingsPlanPaused', savingsPlanId: 'sp-1', paused: true });
      expect(
        apply(engine, { type: 'closeAccount', accountId: CLEARING, targetAccountId: 'acc-1' }),
      ).toEqual({ ok: false, error: 'depot-not-empty' });
      ok(engine, { type: 'deleteSavingsPlan', savingsPlanId: 'sp-1' });
      ok(engine, { type: 'closeAccount', accountId: CLEARING, targetAccountId: 'acc-1' });
      expect(apply(engine, { type: 'createSavingsPlan', plan: plan(5_000, 15) })).toEqual({
        ok: false,
        error: 'depot-closed',
      });
    });
  });

  describe('snapshots', () => {
    it('continues after a restore as without it', () => {
      const prices = [{ tick: 0, price: ASK_120 }];
      const running = setup({ balance: 50_000 });
      create(running, plan(5_000, 15));
      create(running, plan(3_000, 6));
      running.runUntil(at(10, 5));
      const restored = restore(running.snapshot(), prices);
      running.runUntil(at(30, 6));
      restored.runUntil(at(30, 6));
      expect(restored.snapshot()).toEqual(running.snapshot());
      expect(restored.player.positions[0].quantity).toBe(running.player.positions[0].quantity);
    });
  });
});
