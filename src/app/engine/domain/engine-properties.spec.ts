import fc from 'fast-check';

import { journalBalances } from '@app/banking/domain/ledger-logic';
import {
  AccountId,
  DepotId,
  OPENABLE_ACCOUNT_KINDS,
} from '@app/banking/domain/models/account.model';
import { Transaction } from '@app/banking/domain/models/ledger.model';
import { dateTimeToTick, GAME_START_TICK } from '@app/clock/domain/calendar-logic';
import { TICKS_PER_DAY } from '@app/clock/domain/models/time.model';
import { FactorStateEntry } from '@app/market/domain/models/market-state.model';
import {
  AUTO_PAUSE_CODES,
  GameNotification,
} from '@app/notifications/domain/models/notification.model';
import {
  ORDER_SIDES,
  ORDER_TYPES,
  OrderSpec,
  OrderValidity,
} from '@app/trading/domain/models/order.model';
import { Position } from '@app/trading/domain/models/position.model';
import { isActive, reservedAmount } from '@app/trading/domain/order-reservation-logic';
import { miniWorld } from '@app/world/domain/testing/mini-world';

import { GameEngine } from './game-engine';
import { createGameWorld } from './game-world';
import { CommandResult, GameCommand } from './models/engine-command.model';
import { EngineEvent } from './models/engine-event.model';
import { BACKGROUND_MODES, GameSnapshot, GameState } from './models/game-state.model';
import { GameWorld } from './models/game-world.model';
import { replayCommands } from './replay';
import { startBankingGame, withBooks, withTestBanks } from './testing/banking-game';
import { MINI_START_CONDITIONS } from './testing/mini-game';

import { TEST_SEEDS } from '../../../testing/seeds';

// Determinism contract of the engine (TS §4.5 rule 5, §4.6) as properties on the mini world:
// any split of the ticks equals one run; snapshot, restore and replay equal an uninterrupted run.
// Both include the journal, and the cached balances always equal the sums of the journal (TS §7.2).
// The player has accounts at the test banks that book every kind of household transaction (TS §7.4):
// salary and living costs, account fees, overdraft interest beyond the limit, monthly savings
// interest with tax, quarterly savings interest and debit interest on a clearing account. The
// commands are random bank commands (AP 3.3), background modes, the notification commands (AP 3.6)
// and watchlist updates (AP 4.4) and order commands (AP 5.1: placing, changing and cancelling in two
// depots, one of them holding shares); many of them are rejected, which must be just as
// deterministic. The notifications of the runs (overdrafts, interest, month ends, orders) are part
// of both properties, and the positions always equal the start positions plus the unit postings.

/** End of the runs: four months after the start, across three month starts and a quarter. */
const END_TICK = dateTimeToTick({ year: 2030, month: 8, day: 1 }) - 1;
/** Longest segment that a run walks with `step()`, so that a run stays cheap. */
const MAX_STEPPED_TICKS = 3 * TICKS_PER_DAY;

const arbRunTick = (): fc.Arbitrary<number> => fc.integer({ min: GAME_START_TICK, max: END_TICK });

/** Mostly the accounts of the start, sometimes ones that random commands may have opened. */
const arbAccountId = (): fc.Arbitrary<AccountId> =>
  fc.oneof(
    { weight: 3, arbitrary: fc.constantFrom<AccountId>('acc-1', 'acc-2', 'acc-3', 'acc-4') },
    { weight: 1, arbitrary: fc.integer({ min: 5, max: 9 }).map((n): AccountId => `acc-${n}`) },
  );

type WithoutStamp<T> = T extends unknown ? Omit<T, 'id' | 'tick'> : never;

/** Watchlists from a few instruments of the world and an unknown ID, often with a repeated ID. */
const arbWatchlist = (instruments: readonly string[]): fc.Arbitrary<string[]> =>
  fc.array(fc.constantFrom(...instruments, 'unknown'), { maxLength: 4 });

const arbDepotId = (): fc.Arbitrary<DepotId> =>
  fc.constantFrom<DepotId>('dep-5', 'dep-7', 'dep-7', 'dep-7', 'dep-9');

const arbOrderId = (): fc.Arbitrary<string> =>
  fc.integer({ min: 1, max: 6 }).map((n) => `ord-${n}`);

/** Prices around those of the mini world, so that limits and stops are sometimes reached. */
const arbPrice = (): fc.Arbitrary<number> =>
  fc.integer({ min: 100, max: 40_000 }).map((cents) => cents / 100);

/** Mostly short validities, so that the runs do not check orders for months. */
const arbValidity = (): fc.Arbitrary<OrderValidity> =>
  fc.oneof(
    { weight: 4, arbitrary: fc.constant<OrderValidity>({ kind: 'day' }) },
    { weight: 1, arbitrary: fc.constant<OrderValidity>({ kind: 'gtc' }) },
    {
      weight: 1,
      arbitrary: fc
        .integer({ min: 1, max: 20 })
        .map((day): OrderValidity => ({ kind: 'date', date: { year: 2030, month: 5, day } })),
    },
  );

const arbOrderSpec = (instruments: readonly string[]): fc.Arbitrary<OrderSpec> =>
  fc
    .record({
      depotId: arbDepotId(),
      instrumentId: fc.constantFrom(...instruments),
      side: fc.constantFrom(...ORDER_SIDES),
      type: fc.constantFrom(...ORDER_TYPES),
      size: fc.oneof(
        fc
          .integer({ min: 1, max: 20 })
          .map((shares) => ({ kind: 'quantity' as const, quantity: shares * 1_000_000 })),
        fc
          .integer({ min: 1, max: 20 })
          .map((shares) => ({ kind: 'quantity' as const, quantity: shares * 1_000_000 })),
        fc
          .integer({ min: 1, max: 3_000_000 })
          .map((quantity) => ({ kind: 'quantity' as const, quantity })),
        fc
          .integer({ min: 100, max: 500_000 })
          .map((amount) => ({ kind: 'amount' as const, amount })),
      ),
      limit: arbPrice(),
      stop: arbPrice(),
      validity: arbValidity(),
    })
    .map((spec) => ({
      ...spec,
      limit: spec.type === 'limit' || spec.type === 'stop-limit' ? spec.limit : null,
      stop: spec.type === 'stop' || spec.type === 'stop-limit' ? spec.stop : null,
    }));

const arbCommandBody = (instruments: readonly string[]): fc.Arbitrary<WithoutStamp<GameCommand>> =>
  fc.oneof(
    fc.record({
      type: fc.constant('setBackgroundMode' as const),
      mode: fc.constantFrom(...BACKGROUND_MODES),
    }),
    fc.record({
      type: fc.constant('openAccount' as const),
      bankId: fc.constantFrom('b1', 'b2', 'b3'),
      kind: fc.constantFrom(...OPENABLE_ACCOUNT_KINDS),
    }),
    fc.record({
      type: fc.constant('transfer' as const),
      fromAccountId: arbAccountId(),
      toAccountId: arbAccountId(),
      amount: fc.integer({ min: 1, max: 2_000_000 }),
      purpose: fc.string({ maxLength: 8 }),
    }),
    fc.record({ type: fc.constant('setSalaryAccount' as const), accountId: arbAccountId() }),
    fc.record({
      type: fc.constant('setAutoPause' as const),
      code: fc.constantFrom(...AUTO_PAUSE_CODES),
      enabled: fc.boolean(),
    }),
    fc.record(
      {
        type: fc.constant('markNotificationsRead' as const),
        upTo: fc.integer({ min: 0, max: 12 }),
        seqs: fc.array(fc.integer({ min: 1, max: 12 }), { maxLength: 3 }),
      },
      { requiredKeys: ['type'] },
    ),
    fc.record(
      {
        type: fc.constant('closeAccount' as const),
        accountId: arbAccountId(),
        targetAccountId: arbAccountId(),
      },
      { requiredKeys: ['type', 'accountId'] },
    ),
    fc.record({ type: fc.constant('updateWatchlist' as const), ids: arbWatchlist(instruments) }),
    fc.record({ type: fc.constant('placeOrder' as const), order: arbOrderSpec(instruments) }),
    fc.record({ type: fc.constant('placeOrder' as const), order: arbOrderSpec(instruments) }),
    fc.record({ type: fc.constant('placeOrder' as const), order: arbOrderSpec(instruments) }),
    fc.record({ type: fc.constant('placeOrder' as const), order: arbOrderSpec(instruments) }),
    fc.record({ type: fc.constant('placeOrder' as const), order: arbOrderSpec(instruments) }),
    fc.record({
      type: fc.constant('changeOrder' as const),
      orderId: arbOrderId(),
      change: fc.record(
        { limit: arbPrice(), stop: arbPrice(), validity: arbValidity() },
        { requiredKeys: [] },
      ),
    }),
    fc.record({ type: fc.constant('cancelOrder' as const), orderId: arbOrderId() }),
  );

/**
 * Commands at random ticks in log order (ascending tick, stable). The ticks come from a small pool,
 * so that several commands often share a tick, also the tick of a snapshot.
 */
const arbCommands = (instruments: readonly string[]): fc.Arbitrary<GameCommand[]> =>
  fc
    .tuple(
      fc.array(arbRunTick(), { minLength: 1, maxLength: 4 }),
      fc.array(fc.record({ slot: fc.nat(), body: arbCommandBody(instruments) }), { maxLength: 10 }),
    )
    .map(([ticks, drafts]) =>
      drafts
        .map(
          ({ slot, body }, n) =>
            ({ ...body, tick: ticks[slot % ticks.length], id: `cmd-${n}` }) as GameCommand,
        )
        .sort((a, b) => a.tick - b.tick),
    );

interface Reference {
  results: CommandResult[];
  snapshot: ReturnType<GameEngine['snapshot']>;
  events: EngineEvent[];
  journal: Transaction[];
  notifications: GameNotification[];
}

describe('GameEngine properties', () => {
  let world: GameWorld;
  let start: GameSnapshot;
  let monthStarts: readonly FactorStateEntry[];
  let instruments: string[];

  beforeAll(() => {
    const { seedKey, world: mini } = miniWorld(TEST_SEEDS.mini);
    const engine = startBankingGame(createGameWorld(seedKey, mini), MINI_START_CONDITIONS);
    world = withTestBanks(engine.world);
    const { companies, indices, etfs } = mini;
    instruments = [companies[0].id, `${indices[0].id}-tr`, etfs[0].id, companies[1].id];
    const books = withBooks(engine.snapshot(), {
      accounts: [
        { kind: 'savings', bankId: 'b1', balance: 30_000_000 },
        { kind: 'savings', bankId: 'b2', balance: 1_000_000 },
        { kind: 'clearing', bankId: 'b3', balance: -200_000 },
        { kind: 'clearing', bankId: 'b3', balance: 2_000_000 },
      ],
      balances: { 'acc-1': -600_000 },
    }) as GameState;
    books.player.positions = [
      { depotId: 'dep-7', instrumentId: companies[0].id, quantity: 15_500_000 },
      { depotId: 'dep-7', instrumentId: etfs[0].id, quantity: 8_000_000 },
    ];
    start = books;
    monthStarts = engine.monthStartsAfter(-1);
  });

  function restoreStart(): GameEngine {
    return GameEngine.restore(world, start, { monthStarts });
  }

  /** One uninterrupted run with the commands applied at their ticks. */
  function referenceRun(commands: readonly GameCommand[]): Reference {
    const engine = restoreStart();
    const results = replayCommands(engine, commands, END_TICK);
    return {
      results,
      snapshot: engine.snapshot(),
      events: engine.drainEvents(),
      journal: engine.drainTransactions(),
      notifications: engine.drainNotifications(),
    };
  }

  /**
   * The balances of the start (set without transactions) plus the sums of the journal; accounts
   * opened by commands start at 0.
   */
  function expectBalancesOfJournal(
    snapshot: ReturnType<GameEngine['snapshot']>,
    journal: readonly Transaction[],
  ): void {
    const sums = journalBalances(journal);
    const expected = new Map(
      snapshot.player.accounts.map(({ id }) => [
        id,
        (start.player.balances.get(id) ?? 0) + (sums.get(id) ?? 0),
      ]),
    );
    expect(snapshot.player.balances).toEqual(expected);
  }

  /**
   * The positions of the start plus the unit postings of the journal (TS §7.2), and the order
   * book: active orders hold the reservations, closed ones nothing.
   */
  function expectPositionsAndOrders(
    snapshot: ReturnType<GameEngine['snapshot']>,
    journal: readonly Transaction[],
  ): void {
    const sums = new Map<string, Position>();
    for (const position of [
      ...start.player.positions,
      ...journal.flatMap(({ units }) => units ?? []),
    ]) {
      const key = `${position.depotId}/${position.instrumentId}`;
      const sum = sums.get(key) ?? { ...position, quantity: 0 };
      sums.set(key, { ...sum, quantity: sum.quantity + position.quantity });
    }
    const expected = [...sums.values()].filter(({ quantity }) => quantity !== 0);
    const sort = (positions: readonly Position[]): Position[] =>
      [...positions].sort((a, b) =>
        `${a.depotId}/${a.instrumentId}`.localeCompare(`${b.depotId}/${b.instrumentId}`),
      );
    expect(sort(snapshot.player.positions)).toEqual(sort(expected));
    const { orders, orderHistory } = snapshot.player;
    expect(orders.every(({ status }) => isActive(status))).toBe(true);
    expect(orderHistory.every(({ status, reserved }) => !isActive(status) && reserved === 0)).toBe(
      true,
    );
    for (const depot of snapshot.player.depots) {
      const own = orders.filter((order) => order.depotId === depot.id && order.side === 'buy');
      expect(reservedAmount(orders, depot.id)).toBe(
        own.reduce((sum, { reserved }) => sum + reserved, 0),
      );
    }
  }

  it('runs through every kind of household transaction', () => {
    const { journal, events } = referenceRun([]);
    const types = new Set(journal.map(({ type }) => type));
    expect([...types].sort()).toEqual([
      'account-fee',
      'credit-interest',
      'debit-interest',
      'living-costs',
      'overdraft-interest',
      'salary',
      'tax',
    ]);
    const credited = events.flatMap((event) =>
      event.type === 'interest-credited' ? [event.accountId] : [],
    );
    expect(credited.filter((id) => id === 'acc-3')).toHaveLength(1);
    expect(journal.some(({ units }) => units !== undefined)).toBe(false);
    const codes = new Set(referenceRun([]).notifications.map(({ code }) => code));
    expect([...codes].sort()).toEqual([
      'interest-credited',
      'month-closed',
      'overdraft-limit-exceeded',
    ]);
  });

  it('ends in the same state with the same events for any split of the ticks', () => {
    const arbSegment = fc.record({
      tick: arbRunTick(),
      mode: fc.constantFrom('runUntil', 'yielding', 'step'),
      yieldEvery: fc.integer({ min: 1, max: 5 }),
    });
    fc.assert(
      fc.property(
        arbCommands(instruments),
        fc.array(arbSegment, { maxLength: 8 }),
        (commands, segments) => {
          const reference = referenceRun(commands);
          const engine = restoreStart();
          const events: EngineEvent[] = [];
          const journal: Transaction[] = [];
          const notifications: GameNotification[] = [];
          const targets = [
            ...segments,
            ...commands.map((command) => ({ tick: command.tick, mode: 'runUntil', yieldEvery: 1 })),
            { tick: END_TICK, mode: 'runUntil', yieldEvery: 1 },
          ].sort((a, b) => a.tick - b.tick);
          let next = 0;
          for (const { tick, mode, yieldEvery } of targets) {
            if (mode === 'step' && tick - engine.tick <= MAX_STEPPED_TICKS) {
              while (engine.tick < tick) {
                engine.step();
              }
            } else if (mode === 'yielding') {
              let calls = 0;
              while (!engine.runUntil(tick, () => ++calls % yieldEvery === 0)) {
                events.push(...engine.drainEvents());
                journal.push(...engine.drainTransactions());
                notifications.push(...engine.drainNotifications());
              }
            } else {
              engine.runUntil(tick);
            }
            while (next < commands.length && commands[next].tick === engine.tick) {
              expect(engine.applyCommand(commands[next])).toEqual(reference.results[next]);
              next++;
            }
            events.push(...engine.drainEvents());
            journal.push(...engine.drainTransactions());
            notifications.push(...engine.drainNotifications());
          }
          expect(next).toBe(commands.length);
          expect(engine.snapshot()).toEqual(reference.snapshot);
          expect(events).toEqual(reference.events);
          expect(journal).toEqual(reference.journal);
          expect(notifications).toEqual(reference.notifications);
          expectBalancesOfJournal(reference.snapshot, reference.journal);
          expectPositionsAndOrders(reference.snapshot, reference.journal);
        },
      ),
      { numRuns: 15 },
    );
  });

  it('continues a restored snapshot with replayed commands like an uninterrupted run', () => {
    fc.assert(
      fc.property(
        arbCommands(instruments),
        arbRunTick(),
        fc.nat(),
        fc.constantFrom('none', 'all', 'until-snapshot', 'first-months'),
        (commands, snapshotTick, appliedAtSnapshot, monthStarts) => {
          const live = restoreStart();
          let next = 0;
          while (next < commands.length && commands[next].tick < snapshotTick) {
            live.runUntil(commands[next].tick);
            live.applyCommand(commands[next++]);
          }
          live.runUntil(snapshotTick);
          // Some commands of the snapshot tick may already be in the snapshot.
          const atSnapshot = commands.filter((command) => command.tick === snapshotTick).length;
          for (let n = 0; n < appliedAtSnapshot % (atSnapshot + 1); n++) {
            live.applyCommand(commands[next++]);
          }
          live.drainEvents();
          const before = live.drainTransactions();
          const notifiedBefore = live.drainNotifications();
          const snapshot = live.snapshot();
          const storedMonthStarts = live.monthStartsAfter(-1);
          replayCommands(live, commands.slice(next), END_TICK);
          const after = live.drainEvents();
          const journalAfter = live.drainTransactions();
          const notifiedAfter = live.drainNotifications();

          const entries = {
            none: [],
            all: live.monthStartsAfter(-1),
            'until-snapshot': storedMonthStarts,
            'first-months': storedMonthStarts.slice(0, 7),
          }[monthStarts];
          const restored = GameEngine.restore(world, snapshot, { monthStarts: entries });
          replayCommands(restored, commands, END_TICK);

          expect(restored.snapshot()).toEqual(live.snapshot());
          expect(restored.drainEvents()).toEqual(after);
          expect(restored.drainTransactions()).toEqual(journalAfter);
          expect(restored.drainNotifications()).toEqual(notifiedAfter);
          expect(restored.monthStartsAfter(-1)).toEqual(live.monthStartsAfter(-1));
          const reference = referenceRun(commands);
          expect(reference.snapshot).toEqual(live.snapshot());
          expect([...before, ...journalAfter]).toEqual(reference.journal);
          expect([...notifiedBefore, ...notifiedAfter]).toEqual(reference.notifications);
          expectBalancesOfJournal(live.snapshot(), reference.journal);
          expectPositionsAndOrders(live.snapshot(), reference.journal);
        },
      ),
      { numRuns: 15 },
    );
  });
});
