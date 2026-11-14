import { AccountId } from '@app/banking/domain/models/account.model';
import { Transaction } from '@app/banking/domain/models/ledger.model';
import { StandingOrderSpec } from '@app/banking/domain/models/standing-order.model';
import { dateTimeToTick } from '@app/clock/domain/calendar-logic';
import { Tick } from '@app/clock/domain/models/time.model';
import { Order } from '@app/trading/domain/models/order.model';
import { miniWorld } from '@app/world/domain/testing/mini-world';

import { GameEngine } from './game-engine';
import { createGameWorld } from './game-world';
import { CommandResult, GameCommand } from './models/engine-command.model';
import { GameSnapshot, GameState, StartConditions } from './models/game-state.model';
import { GameWorld } from './models/game-world.model';
import { standingOrderViews } from './standing-order-projection';
import { startBankingGame, withBooks, withTestBanks } from './testing/banking-game';

import { TEST_SEEDS } from '../../../testing/seeds';

// Standing orders in the engine (US-BK-10, TS §7.4, AP 5.6a) with the test banks of
// `testing/banking-game.ts`: home bank `b1` with the salary account `acc-1` (overdraft limit
// 2 × 2.500 € = 5.000 €), broker `b3` for depots. Execution days come from the calendar of
// 2030 (TS §7.4 examples); amounts are literal.

function at(day: number, month: number, hour = 0, minute = 0): Tick {
  return dateTimeToTick({ year: 2030, month, day, hour, minute });
}

const NET_INCOME = 250_000;
const FUNDED: StartConditions = {
  startCapital: 1_000_000,
  netIncome: NET_INCOME,
  livingCosts: 180_000,
};

type WithoutStamp<T> = T extends unknown ? Omit<T, 'id' | 'tick'> : never;
type Body = WithoutStamp<GameCommand>;

function order(from: AccountId, to: AccountId, amount: number, day: number): StandingOrderSpec {
  return { fromAccountId: from, toAccountId: to, amount, day, purpose: '' };
}

/** The transfers of standing orders: ID, source, target and amount. */
function executions(transactions: readonly Transaction[]): unknown[][] {
  return transactions
    .filter(({ refs }) => refs?.['standingOrderId'] !== undefined)
    .map(({ tick, refs, postings }) => [
      tick,
      refs?.['standingOrderId'],
      ...postings.map(({ account, amount }) => [account, amount]),
    ]);
}

function bankRuns(engine: GameEngine): Tick[] {
  return engine
    .snapshot()
    .scheduler.heap.filter(({ kind }) => kind === 'bank-run')
    .map(({ tick }) => tick);
}

describe('GameEngine standing orders', () => {
  let world: GameWorld;
  let start: GameSnapshot;
  let monthStarts: ReturnType<GameEngine['monthStartsAfter']>;
  let instrumentId: string;
  let nextId: number;

  beforeAll(() => {
    const { seedKey, world: mini } = miniWorld(TEST_SEEDS.mini);
    const engine = startBankingGame(createGameWorld(seedKey, mini), FUNDED);
    world = withTestBanks(engine.world);
    start = engine.snapshot();
    // Up to August, so that restores in later months find their month starts.
    engine.runUntil(at(1, 8));
    monthStarts = engine.monthStartsAfter(-1);
    instrumentId = mini.companies[0].id;
  });

  beforeEach(() => {
    nextId = 1;
  });

  /** The funded game at 01.04.2030 00:00 with a savings account `acc-2` at `b1`, buffers empty. */
  function newEngine(state: GameSnapshot = start): GameEngine {
    const engine = GameEngine.restore(world, state, { monthStarts });
    ok(engine, { type: 'openAccount', bankId: 'b1', kind: 'savings' });
    drain(engine);
    return engine;
  }

  function drain(engine: GameEngine): void {
    engine.drainEvents();
    engine.drainTransactions();
    engine.drainNotifications();
    engine.drainChangedAccounts();
  }

  function apply(engine: GameEngine, body: Body): CommandResult {
    return engine.applyCommand({ ...body, id: `c${nextId++}`, tick: engine.tick } as GameCommand);
  }

  function ok(engine: GameEngine, body: Body): CommandResult {
    const result = apply(engine, body);
    expect(result).toMatchObject({ ok: true });
    return result;
  }

  function create(engine: GameEngine, spec: StandingOrderSpec): CommandResult {
    return ok(engine, { type: 'createStandingOrder', order: spec });
  }

  function next(engine: GameEngine): (Tick | null)[] {
    return standingOrderViews(engine.player, engine.tick).map(({ nextExecution }) => nextExecution);
  }

  describe('execution days', () => {
    // TS §7.4: a transfer in the bank run at 06:00 of the execution day
    it('transfers the amount at 06:00 of its day, every month, with its purpose', () => {
      const engine = newEngine();
      expect(create(engine, { ...order('acc-1', 'acc-2', 50_000, 15), purpose: 'Sparen' })).toEqual(
        { ok: true, standingOrderId: 'so-1' },
      );
      expect(next(engine)).toEqual([at(15, 4, 6)]);
      engine.runUntil(at(15, 4, 5, 59));
      expect(executions(engine.drainTransactions())).toEqual([]);
      const values = { ...engine.player.monthlyValues };
      const inflows = structuredClone(engine.player.inflows);
      engine.runUntil(at(15, 4, 6));
      const april = engine.drainTransactions();
      expect(april.map(({ type, params, refs }) => [type, params, refs])).toEqual([
        ['transfer', { purpose: 'Sparen' }, { standingOrderId: 'so-1' }],
      ]);
      expect(executions(april)).toEqual([
        [at(15, 4, 6), 'so-1', ['acc-1', -50_000], ['acc-2', 50_000]],
      ]);
      // A transfer between own accounts: no household flow, no deposit from outside.
      expect(engine.player.monthlyValues).toEqual(values);
      expect(engine.player.inflows).toEqual(inflows);
      expect(engine.drainNotifications()).toEqual([]);
      // Wednesday, 15.05.2030
      expect(next(engine)).toEqual([at(15, 5, 6)]);
      engine.runUntil(at(15, 5, 6));
      expect(executions(engine.drainTransactions())).toEqual([
        [at(15, 5, 6), 'so-1', ['acc-1', -50_000], ['acc-2', 50_000]],
      ]);
    });

    // TS §7.4: Saturday, 13.04.2030 → Monday, 15.04.; created after the day → the next month
    it('moves a weekend day to the next bank working day and starts on or after the creation day', () => {
      const engine = newEngine();
      create(engine, order('acc-1', 'acc-2', 10_000, 13));
      engine.runUntil(at(14, 4, 12));
      expect(executions(engine.drainTransactions())).toEqual([]);
      create(engine, order('acc-1', 'acc-2', 20_000, 13));
      expect(next(engine)).toEqual([at(15, 4, 6), at(13, 5, 6)]);
      engine.runUntil(at(13, 5, 6));
      expect(executions(engine.drainTransactions())).toEqual([
        [at(15, 4, 6), 'so-1', ['acc-1', -10_000], ['acc-2', 10_000]],
        [at(13, 5, 6), 'so-1', ['acc-1', -10_000], ['acc-2', 10_000]],
        [at(13, 5, 6), 'so-2', ['acc-1', -20_000], ['acc-2', 20_000]],
      ]);
    });

    it('runs the bank only on the days when something is due', () => {
      const engine = newEngine();
      expect(bankRuns(engine)).toEqual([at(1, 4, 6)]);
      create(engine, order('acc-1', 'acc-2', 10_000, 1));
      // Due today: the bank run of 06:00 executes it too.
      expect(bankRuns(engine)).toEqual([at(1, 4, 6)]);
      engine.runUntil(at(1, 4, 6));
      expect(bankRuns(engine)).toEqual([at(30, 4, 6)]);
      // Created at 06:00 after the bank run of its day: the next month.
      create(engine, order('acc-1', 'acc-2', 10_000, 1));
      expect(next(engine)).toEqual([at(1, 5, 6), at(1, 5, 6)]);
      create(engine, order('acc-1', 'acc-2', 10_000, 10));
      expect(bankRuns(engine)).toEqual([at(10, 4, 6)]);
      engine.runUntil(at(10, 4, 6));
      expect(bankRuns(engine)).toEqual([at(30, 4, 6)]);
      expect(executions(engine.drainTransactions()).map(([tick, id]) => [tick, id])).toEqual([
        [at(1, 4, 6), 'so-1'],
        [at(10, 4, 6), 'so-3'],
      ]);
    });
  });

  describe('order in the bank run', () => {
    /** The game on Thursday, 27.06.2030 at noon with `acc-1` at −5.000 €, its limit. */
    function atLimitBeforeSalary(): GameEngine {
      const running = newEngine();
      running.runUntil(at(27, 6, 12));
      const engine = GameEngine.restore(
        world,
        withBooks(running.snapshot(), { balances: { 'acc-1': -500_000 } }),
        { monthStarts },
      );
      drain(engine);
      return engine;
    }

    // TS §7.4: Friday, 28.06.2030 is the last bank working day: salary first, then the orders
    it('sees the salary of the same day and executes the orders in the order they were created', () => {
      const engine = atLimitBeforeSalary();
      create(engine, order('acc-1', 'acc-2', 200_000, 28));
      create(engine, order('acc-1', 'acc-2', 100_000, 28));
      create(engine, order('acc-1', 'acc-2', 50_000, 28));
      engine.runUntil(at(28, 6, 6));
      const transactions = engine.drainTransactions();
      expect(transactions.map(({ type }) => type)).toEqual(['salary', 'transfer', 'transfer']);
      // −5.000 € + 2.500 € salary leaves 2.500 € of the limit: 2.000 € go, then 1.000 € do not,
      // then 500 € do.
      expect(executions(transactions)).toEqual([
        [at(28, 6, 6), 'so-1', ['acc-1', -200_000], ['acc-2', 200_000]],
        [at(28, 6, 6), 'so-3', ['acc-1', -50_000], ['acc-2', 50_000]],
      ]);
      expect(engine.player.balances.get('acc-1')).toBe(-500_000);
      const failed = {
        type: 'standing-order-failed',
        tick: at(28, 6, 6),
        standingOrderId: 'so-2',
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: 100_000,
        available: 50_000,
      };
      expect(engine.drainEvents()).toContainEqual(failed);
      // A warning without auto-pause (TS §12).
      expect(engine.autoPauseNotification).toBeNull();
      expect(engine.drainNotifications()).toEqual([
        expect.objectContaining({
          code: 'standing-order-failed',
          tick: at(28, 6, 6),
          params: {
            standingOrderId: 'so-2',
            fromAccountId: 'acc-1',
            toAccountId: 'acc-2',
            amount: 100_000,
            available: 50_000,
          },
        }),
      ]);
      // The failed month is done; Sunday, 28.07. → Monday, 29.07.
      expect(next(engine)).toEqual([at(29, 7, 6), at(29, 7, 6), at(29, 7, 6)]);
    });

    // TS §7.4, §7.5: reservations of open buy orders reduce the available amount of a clearing account
    it('counts the reservations of open buy orders on a clearing account as the source', () => {
      const opening = GameEngine.restore(world, start, { monthStarts });
      ok(opening, { type: 'openAccount', bankId: 'b3', kind: 'depot' });
      ok(opening, {
        type: 'transfer',
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: 100_000,
        purpose: '',
      });
      const state = structuredClone(opening.snapshot()) as GameState;
      const reserving = {
        id: 'ord-1',
        depotId: 'dep-3',
        instrumentId,
        side: 'buy',
        type: 'limit',
        size: { kind: 'quantity', quantity: 1_000_000 },
        limit: 0.01,
        stop: null,
        validity: { kind: 'gtc' },
        status: 'open',
        placedAt: state.tick,
        expiresAt: at(1, 4, 0) + 1_000_000,
        reserved: 60_000,
        triggeredAt: null,
        execution: null,
        closedAt: null,
        rejection: null,
      } satisfies Order;
      state.player.orders = [reserving];
      state.player.orderSequence = 1;
      const engine = GameEngine.restore(world, state, { monthStarts });
      drain(engine);
      create(engine, order('acc-2', 'acc-1', 50_000, 1));
      create(engine, order('acc-2', 'acc-1', 40_000, 1));
      create(engine, order('acc-2', 'acc-1', 1, 1));
      engine.runUntil(at(1, 4, 6));
      // 1.000 € − 600 € reserved = 400 €: no partial transfer of 500 €, then 400 €, then nothing.
      expect(executions(engine.drainTransactions())).toEqual([
        [at(1, 4, 6), 'so-2', ['acc-2', -40_000], ['acc-1', 40_000]],
      ]);
      expect(
        engine
          .drainEvents()
          .filter(({ type }) => type === 'standing-order-failed')
          .map((event) => [
            (event as { standingOrderId: string }).standingOrderId,
            (event as { available: number }).available,
          ]),
      ).toEqual([
        ['so-1', 40_000],
        ['so-3', 0],
      ]);
    });
  });

  describe('commands', () => {
    it('pauses, resumes, changes and deletes a standing order', () => {
      const engine = newEngine();
      ok(engine, { type: 'openAccount', bankId: 'b1', kind: 'savings' });
      create(engine, order('acc-1', 'acc-2', 10_000, 15));
      // A second order, which none of the commands on `so-1` may touch.
      create(engine, order('acc-1', 'acc-3', 1_000, 20));
      const other = engine.player.standingOrders[1];
      // Commands on the second order leave the first as it is.
      const first = engine.player.standingOrders[0];
      ok(engine, { type: 'setStandingOrderPaused', standingOrderId: 'so-2', paused: true });
      expect(engine.player.standingOrders.map(({ paused }) => paused)).toEqual([false, true]);
      expect(engine.player.standingOrders[0]).toBe(first);
      ok(engine, { type: 'setStandingOrderPaused', standingOrderId: 'so-2', paused: false });
      engine.runUntil(at(10, 4, 12));
      ok(engine, { type: 'setStandingOrderPaused', standingOrderId: 'so-1', paused: true });
      expect(next(engine)).toEqual([null, at(22, 4, 6)]);
      engine.runUntil(at(16, 4, 12));
      // Resumed after its day: April stays skipped.
      ok(engine, { type: 'setStandingOrderPaused', standingOrderId: 'so-1', paused: false });
      expect(next(engine)[0]).toBe(at(15, 5, 6));
      engine.runUntil(at(14, 5, 12));
      ok(engine, { type: 'setStandingOrderPaused', standingOrderId: 'so-1', paused: true });
      const paused = engine.player.standingOrders;
      ok(engine, { type: 'setStandingOrderPaused', standingOrderId: 'so-1', paused: true });
      expect(engine.player.standingOrders).toBe(paused);
      // Resumed before its day: May executes.
      ok(engine, { type: 'setStandingOrderPaused', standingOrderId: 'so-1', paused: false });
      engine.runUntil(at(20, 5, 12));
      expect(executions(engine.drainTransactions()).filter(([, id]) => id === 'so-1')).toEqual([
        [at(15, 5, 6), 'so-1', ['acc-1', -10_000], ['acc-2', 10_000]],
      ]);
      const otherNow = engine.player.standingOrders[1];
      // Moved to a later day after May was executed: May stays done.
      ok(engine, {
        type: 'changeStandingOrder',
        standingOrderId: 'so-1',
        order: { ...order('acc-2', 'acc-1', 5_000, 25), purpose: 'zurück' },
      });
      // Tuesday, 25.06.2030
      expect(next(engine)[0]).toBe(at(25, 6, 6));
      expect(engine.player.standingOrders[1]).toBe(otherNow);
      expect(bankRuns(engine)).toEqual([at(31, 5, 6)]);
      engine.runUntil(at(25, 6, 6));
      expect(
        engine
          .drainTransactions()
          .filter(({ refs }) => refs?.['standingOrderId'] === 'so-1')
          .map(({ postings, params }) => [postings.map(({ amount }) => amount), params]),
      ).toEqual([[[-5_000, 5_000], { purpose: 'zurück' }]]);
      ok(engine, { type: 'deleteStandingOrder', standingOrderId: 'so-1' });
      expect(engine.player.standingOrders.map(({ id }) => id)).toEqual(['so-2']);
      expect(other.id).toBe('so-2');
      engine.runUntil(at(26, 7, 12));
      expect(executions(engine.drainTransactions()).filter(([, id]) => id === 'so-1')).toEqual([]);
    });

    it('rejects invalid standing orders and unknown IDs without changing anything', () => {
      const engine = newEngine();
      create(engine, order('acc-1', 'acc-2', 10_000, 15));
      const before = engine.player.standingOrders;
      const scheduler = engine.snapshot().scheduler;
      const cases: [Body, string][] = [
        [
          { type: 'createStandingOrder', order: order('acc-1', 'acc-2', 10_000, 29) },
          'invalid-day',
        ],
        [
          { type: 'createStandingOrder', order: order('acc-1', 'acc-1', 10_000, 1) },
          'same-account',
        ],
        [
          { type: 'createStandingOrder', order: order('acc-1', 'acc-9', 10_000, 1) },
          'unknown-account',
        ],
        [{ type: 'createStandingOrder', order: order('acc-1', 'acc-2', 0, 1) }, 'invalid-amount'],
        [
          {
            type: 'createStandingOrder',
            order: { ...order('acc-1', 'acc-2', 1, 1), purpose: 'x'.repeat(141) },
          },
          'purpose-too-long',
        ],
        [
          {
            type: 'createStandingOrder',
            order: { fromAccountId: 'acc-1' } as unknown as StandingOrderSpec,
          },
          'invalid-command',
        ],
        [
          {
            type: 'changeStandingOrder',
            standingOrderId: 'so-2',
            order: order('acc-1', 'acc-2', 1, 1),
          },
          'unknown-standing-order',
        ],
        [
          {
            type: 'changeStandingOrder',
            standingOrderId: 'so-1',
            order: order('acc-1', 'acc-2', 1, 0),
          },
          'invalid-day',
        ],
        [
          { type: 'setStandingOrderPaused', standingOrderId: 'so-2', paused: true },
          'unknown-standing-order',
        ],
        [{ type: 'deleteStandingOrder', standingOrderId: 'so-2' }, 'unknown-standing-order'],
        [
          { type: 'createStandingOrder', order: null as unknown as StandingOrderSpec },
          'invalid-command',
        ],
        [
          {
            type: 'changeStandingOrder',
            standingOrderId: 'so-1',
            order: 'so' as unknown as StandingOrderSpec,
          },
          'invalid-command',
        ],
        [
          {
            type: 'setStandingOrderPaused',
            standingOrderId: 'so-1',
            paused: 'yes' as unknown as boolean,
          },
          'invalid-command',
        ],
        // Every field with a wrong type, also those the rules would reject with another code.
        ...(
          [
            { fromAccountId: 1 },
            { toAccountId: 2 },
            { amount: '100' },
            { day: '1' },
            { purpose: 5 },
          ] as const
        ).map((wrong): [Body, string] => [
          {
            type: 'createStandingOrder',
            order: { ...order('acc-1', 'acc-2', 100, 1), ...wrong } as unknown as StandingOrderSpec,
          },
          'invalid-command',
        ]),
      ];
      for (const [body, error] of cases) {
        expect(apply(engine, body)).toEqual({ ok: false, error });
      }
      expect(engine.player.standingOrders).toBe(before);
      expect(engine.player.standingOrderSequence).toBe(1);
      expect(engine.snapshot().scheduler).toEqual(scheduler);
    });

    // Decision of AP 5.6a (TS §7.4): delete the standing orders first
    it('keeps source and target of a standing order open until it is deleted', () => {
      const engine = newEngine();
      ok(engine, { type: 'openAccount', bankId: 'b1', kind: 'savings' });
      ok(engine, { type: 'openAccount', bankId: 'b1', kind: 'savings' });
      create(engine, order('acc-1', 'acc-2', 10_000, 15));
      create(engine, order('acc-3', 'acc-1', 10_000, 15));
      expect(engine.closingPreview('acc-3')).toMatchObject({
        preview: { blockers: ['standing-orders'] },
      });
      expect(engine.closingPreview('acc-4')).toMatchObject({ preview: { blockers: [] } });
      ok(engine, { type: 'setStandingOrderPaused', standingOrderId: 'so-1', paused: true });
      const preview = engine.closingPreview('acc-2');
      expect(preview).toMatchObject({ ok: true, preview: { blockers: ['standing-orders'] } });
      expect(apply(engine, { type: 'closeAccount', accountId: 'acc-2' })).toEqual({
        ok: false,
        error: 'standing-orders',
      });
      ok(engine, { type: 'deleteStandingOrder', standingOrderId: 'so-1' });
      ok(engine, { type: 'closeAccount', accountId: 'acc-2' });
      // A closed account can be no part of a new standing order.
      expect(
        apply(engine, { type: 'createStandingOrder', order: order('acc-1', 'acc-2', 1, 1) }),
      ).toEqual({ ok: false, error: 'account-closed' });
    });

    it('leaves standing orders as they are when the salary account changes', () => {
      const engine = newEngine();
      ok(engine, { type: 'openAccount', bankId: 'b1', kind: 'current' });
      create(engine, order('acc-1', 'acc-2', 10_000, 15));
      const before = engine.player.standingOrders;
      ok(engine, { type: 'setSalaryAccount', accountId: 'acc-3' });
      expect(engine.player.standingOrders).toBe(before);
    });
  });
});
