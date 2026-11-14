import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { IDBPDatabase, openDB } from 'idb';

import { AccountId } from '@app/banking/domain/models/account.model';
import { Transaction } from '@app/banking/domain/models/ledger.model';
import { GameCommand } from '@app/engine/domain/models/engine-command.model';
import { GameSnapshot } from '@app/engine/domain/models/game-state.model';
import { miniGame, MiniGame } from '@app/engine/domain/testing/mini-game';
import { SCHEMA_VERSION, SIM_VERSION } from '@app/engine/domain/version';
import { GameNotification } from '@app/notifications/domain/models/notification.model';
import {
  DB_NAME,
  DB_VERSION,
  JOURNAL_STORES,
  WORKER_STORES,
} from '@app/persistence/data-access/schema/idb-schema';
import { openPortfoligoDb } from '@app/persistence/data-access/schema/open-database';
import { DailyPoint } from '@app/portfolio/domain/models/performance.model';

import { EngineStorage, StoredClock } from './engine-host.model';
import { InMemoryEngineStorage } from './in-memory-engine-storage';
import { IndexedDbEngineStorage } from './indexed-db-engine-storage';

const EPOCH_MS = Date.UTC(2020, 0, 1);
const MS_PER_DAY = 86_400_000;
const NAN = Number.NaN;

function day(year: number, month: number, date: number): number {
  return (Date.UTC(year, month - 1, date) - EPOCH_MS) / MS_PER_DAY;
}

function clock(tick: number, lastSeenAt = 1_000): StoredClock {
  return { tick, speed: '1h', paused: false, lastSeenAt };
}

function command(id: string, tick: number): GameCommand {
  return { id, type: 'setBackgroundMode', tick, mode: 'pause' };
}

/** A salary of 1 € on `account` (balance after it as if every earlier one went there). */
function salary(seq: number, tick: number, account: AccountId): Transaction {
  return {
    seq,
    tick,
    type: 'salary',
    postings: [
      { account, amount: 100, balanceAfter: 100 * seq },
      { account: 'external:employer', amount: -100, balanceAfter: null },
    ],
    params: { month: 4 },
  };
}

function transfer(seq: number, tick: number, from: AccountId, to: AccountId): Transaction {
  return {
    seq,
    tick,
    type: 'transfer',
    postings: [
      { account: from, amount: -50, balanceAfter: 50 },
      { account: to, amount: 50, balanceAfter: 50 },
    ],
  };
}

function interest(seq: number, tick: number): GameNotification {
  return {
    seq,
    tick,
    code: 'interest-credited',
    params: { accountId: 'acc-2', amount: 300 + seq, tax: 0 },
  };
}

/** Type of a value independent of its realm (jsdom globals vs. Node's `structuredClone`). */
function typeName(value: unknown): string {
  return Object.prototype.toString.call(value).slice(8, -1);
}

function snapshotAt(game: MiniGame, tick: number): GameSnapshot {
  return { ...structuredClone(game.start), tick };
}

/** Behaviour both implementations of the port share. */
function describeStorageContract(name: string, create: () => EngineStorage): void {
  describe(`${name}: storage contract`, () => {
    let game: MiniGame;
    let storage: EngineStorage;
    let base: number;

    beforeAll(() => {
      game = miniGame();
    });

    beforeEach(() => {
      globalThis.indexedDB = new IDBFactory();
      storage = create();
      base = game.start.tick;
    });

    it('loads nothing for an unknown player', async () => {
      expect(await storage.loadPlayerState('p1')).toEqual({ monthStarts: [], commands: [] });
      expect(await storage.loadTransactions('p1')).toEqual([]);
    });

    it('stores transactions with a snapshot and on their own and reads them by player and account', async () => {
      const first = salary(1, base, 'acc-1');
      const second = transfer(2, base + 10, 'acc-1', 'acc-2');
      const third = salary(3, base + 20, 'acc-2');
      await storage.saveSnapshot('p1', game.start, { transactions: [first] });
      await storage.saveTransactions('p1', [second, third]);
      // Written again (a snapshot after a periodic write): overwritten, not doubled.
      await storage.saveTransactions('p1', [third]);
      await storage.saveTransactions('p10', [salary(1, base, 'acc-2')]);

      expect(await storage.loadTransactions('p1')).toEqual([first, second, third]);
      expect(await storage.loadTransactions('p1', 'acc-1')).toEqual([first, second]);
      expect(await storage.loadTransactions('p1', 'acc-2')).toEqual([second, third]);
      expect(await storage.loadTransactions('p1', 'acc-3')).toEqual([]);
      expect(await storage.loadTransactions('p10', 'acc-2')).toEqual([salary(1, base, 'acc-2')]);
    });

    it('reads an account in running-number order, whatever the order of the writes', async () => {
      // The statement (AP 3.4) relies on journal order; `acc-1` must not pick up `acc-10`.
      const late = [salary(10, base + 90, 'acc-1'), salary(12, base + 95, 'acc-10')];
      const early = [salary(2, base + 5, 'acc-1'), transfer(9, base + 80, 'acc-10', 'acc-1')];
      await storage.saveTransactions('p1', late);
      await storage.saveTransactions('p1', early);

      expect((await storage.loadTransactions('p1', 'acc-1')).map(({ seq }) => seq)).toEqual([
        2, 9, 10,
      ]);
      expect((await storage.loadTransactions('p1', 'acc-10')).map(({ seq }) => seq)).toEqual([
        9, 12,
      ]);
    });

    it('discards the transactions after a tick', async () => {
      const journal = [salary(1, base, 'acc-1'), salary(2, base + 10, 'acc-1')];
      await storage.saveTransactions('p1', [...journal, salary(3, base + 11, 'acc-1')]);
      await storage.saveTransactions('p2', [salary(1, base + 11, 'acc-1')]);

      await storage.discardAfter('p1', base + 10);

      expect(await storage.loadTransactions('p1')).toEqual(journal);
      expect(await storage.loadTransactions('p2')).toHaveLength(1);
    });

    it('stores daily points in year records with a snapshot and on their own (AP 5.7)', async () => {
      const lastOf2030 = day(2030, 12, 31);
      const points = [lastOf2030 - 1, lastOf2030, lastOf2030 + 1, lastOf2030 + 2].map((d) =>
        dailyPoint(d),
      );
      await storage.saveSnapshot('p1', game.start, { dailyPoints: points.slice(0, 1) });
      await storage.saveDailyPoints('p1', points.slice(1, 3));
      // Written again (a snapshot after a periodic write): replaced, not doubled.
      await storage.saveDailyPoints('p1', [{ ...points[2], netWorth: 7 }, points[3]]);
      await storage.saveDailyPoints('p2', [dailyPoint(lastOf2030)]);

      const changed = [points[0], points[1], { ...points[2], netWorth: 7 }, points[3]];
      expect(await storage.loadDailyPoints('p1', 0, lastOf2030 + 10)).toEqual(changed);
      expect(await storage.loadDailyPoints('p1', lastOf2030, lastOf2030 + 1)).toEqual(
        changed.slice(1, 3),
      );
      expect(await storage.loadDailyPoints('p1', lastOf2030 + 1, lastOf2030)).toEqual([]);
      expect(await storage.loadDailyPoints('p2', 0, lastOf2030 + 10)).toEqual([
        dailyPoint(lastOf2030),
      ]);
    });

    it('keeps the daily points up to the tick when discarding after it', async () => {
      const first = day(2031, 1, 1);
      const points = [0, 1, 2, 3].map((n) => dailyPoint(first + n));
      await storage.saveDailyPoints('p1', [dailyPoint(first - 1), ...points]);

      await storage.discardAfter('p1', points[1].tick);

      expect(await storage.loadDailyPoints('p1', 0, first + 10)).toEqual([
        dailyPoint(first - 1),
        ...points.slice(0, 2),
      ]);
      await storage.discardAfter('p1', points[0].tick - 1);
      expect(await storage.loadDailyPoints('p1', 0, first + 10)).toEqual([dailyPoint(first - 1)]);
      await storage.deletePlayer('p1');
      expect(await storage.loadDailyPoints('p1', 0, first + 10)).toEqual([]);
    });

    it('stores notifications with a snapshot and on their own, by running number', async () => {
      const first = interest(1, base);
      const second = interest(2, base + 10);
      const third = interest(3, base + 20);
      await storage.saveSnapshot('p1', game.start, { notifications: [first] });
      await storage.saveNotifications('p1', [third, second]);
      await storage.saveNotifications('p1', [third]);
      await storage.saveNotifications('p10', [interest(1, base)]);

      expect(await storage.loadNotifications('p1')).toEqual([first, second, third]);
      expect(await storage.loadNotifications('p10')).toEqual([interest(1, base)]);
      expect(await storage.loadNotifications('p2')).toEqual([]);
    });

    it('deletes the notifications before the kept ones with a snapshot (TS §9.1)', async () => {
      await storage.saveNotifications('p1', [
        interest(1, base),
        interest(2, base),
        interest(3, base),
      ]);
      await storage.saveNotifications('p10', [interest(1, base)]);

      await storage.saveSnapshot('p1', game.start, {
        notifications: [interest(4, base)],
        keepNotificationsFrom: 3,
      });

      expect((await storage.loadNotifications('p1')).map(({ seq }) => seq)).toEqual([3, 4]);
      expect(await storage.loadNotifications('p10')).toHaveLength(1);
    });

    it('discards the notifications after a tick', async () => {
      await storage.saveNotifications('p1', [interest(1, base), interest(2, base + 11)]);
      await storage.saveNotifications('p2', [interest(1, base + 11)]);

      await storage.discardAfter('p1', base + 10);

      expect(await storage.loadNotifications('p1')).toEqual([interest(1, base)]);
      expect(await storage.loadNotifications('p2')).toHaveLength(1);
    });

    it('loads clock, snapshot, month starts and commands as they were saved', async () => {
      await storage.saveSnapshot('p1', game.start, { monthStarts: game.monthStarts });
      await storage.appendCommand('p1', command('c1', base), clock(base));
      await storage.appendCommand('p1', command('c2', base + 30), clock(base + 30));
      await storage.saveClock('p1', clock(base + 90, 2_000));

      const state = await storage.loadPlayerState('p1');

      // Typed arrays read back come from the realm of `structuredClone`, so compare with a clone.
      expect(state).toEqual(
        structuredClone({
          clock: clock(base + 90, 2_000),
          snapshot: {
            tick: base,
            schemaVersion: SCHEMA_VERSION,
            simVersion: SIM_VERSION,
            state: game.start,
          },
          monthStarts: game.monthStarts,
          commands: [command('c1', base), command('c2', base + 30)],
        }),
      );
      expect(typeName(state.snapshot?.state.market.logClose)).toBe('Float64Array');
      expect(typeName(state.monthStarts[0].nextExDay)).toBe('Int32Array');
    });

    it('keeps the newest three snapshots and the commands from the oldest kept one on', async () => {
      await storage.appendCommand('p1', command('c0', base + 50), clock(base + 50));
      await storage.appendCommand('p2', command('other', base + 50), clock(base + 50));
      await storage.saveSnapshot('p1', snapshotAt(game, base + 100));
      await storage.appendCommand('p1', command('c1', base + 150), clock(base + 150));
      await storage.saveSnapshot('p1', snapshotAt(game, base + 200));
      await storage.appendCommand('p1', command('c2', base + 200), clock(base + 200));
      await storage.saveSnapshot('p1', snapshotAt(game, base + 300));
      await storage.appendCommand('p1', command('c3', base + 450), clock(base + 450));
      await storage.saveSnapshot('p1', snapshotAt(game, base + 400));

      const state = await storage.loadPlayerState('p1');

      expect(state.snapshot?.tick).toBe(base + 400);
      expect(state.commands).toEqual([command('c3', base + 450)]);
      expect((await storage.loadPlayerState('p2')).commands).toEqual([command('other', base + 50)]);
    });

    it('merges daily candles into year buckets and keeps other players apart', async () => {
      const lastOf2031 = day(2031, 12, 31);
      const secondOf2032 = day(2032, 1, 2);
      await storage.saveDailyCandles('p1', [
        { seriesId: 'A', day: lastOf2031, open: 10, high: NAN, low: NAN, close: 11 },
        { seriesId: 'A', day: secondOf2032, open: 11, high: NAN, low: NAN, close: 12.5 },
        { seriesId: 'B', day: lastOf2031, open: 1, high: 2, low: 0.5, close: 1.5 },
      ]);
      await storage.saveDailyCandles('p1', [
        { seriesId: 'A', day: lastOf2031, open: NAN, high: 12, low: 9.5, close: NAN },
      ]);
      await storage.saveDailyCandles('p2', [
        { seriesId: 'A', day: lastOf2031, open: 99, high: 99, low: 99, close: 99 },
      ]);

      const buckets = await storage.loadDailyCandles('p1', 'A', 2031, 2032);

      expect(buckets.map(({ seriesId, year }) => [seriesId, year])).toEqual([
        ['A', 2031],
        ['A', 2032],
      ]);
      expect(typeName(buckets[0].values)).toBe('Float32Array');
      expect(Array.from(buckets[0].values.subarray(4 * 260))).toEqual([10, 12, 9.5, 11]);
      expect(Array.from(buckets[1].values.subarray(4, 8))).toEqual([11, NAN, NAN, 12.5]);
      expect(await storage.loadDailyCandles('p1', 'A', 2033, 2040)).toEqual([]);
    });

    it('clears the daily candles of one player', async () => {
      const candle = { seriesId: 'A', day: day(2031, 1, 1), open: 1, high: 1, low: 1, close: 1 };
      await storage.saveDailyCandles('p1', [candle]);
      await storage.saveDailyCandles('p2', [candle]);

      await storage.clearCandles('p1');

      expect(await storage.loadDailyCandles('p1', 'A', 2031, 2031)).toEqual([]);
      expect(await storage.loadDailyCandles('p2', 'A', 2031, 2031)).toHaveLength(1);
    });

    it('deletes everything of one player and nothing of another', async () => {
      for (const playerId of ['p1', 'p10']) {
        await storage.saveSnapshot(playerId, game.start, { monthStarts: game.monthStarts });
        await storage.appendCommand(playerId, command('c1', base), clock(base));
        await storage.saveDailyCandles(playerId, [
          { seriesId: 'A', day: day(2031, 1, 1), open: 1, high: 1, low: 1, close: 1 },
        ]);
        await storage.saveTransactions(playerId, [salary(1, base, 'acc-1')]);
        await storage.saveNotifications(playerId, [interest(1, base)]);
      }
      const before = await storage.loadPlayerState('p10');

      await storage.deletePlayer('p1');

      expect(await storage.loadPlayerState('p1')).toEqual({ monthStarts: [], commands: [] });
      expect(await storage.loadTransactions('p1')).toEqual([]);
      expect(await storage.loadTransactions('p10')).toEqual([salary(1, base, 'acc-1')]);
      expect(await storage.loadNotifications('p1')).toEqual([]);
      expect(await storage.loadNotifications('p10')).toEqual([interest(1, base)]);
      expect(await storage.loadDailyCandles('p1', 'A', 2031, 2031)).toEqual([]);
      expect(await storage.loadPlayerState('p10')).toEqual(before);
      expect(await storage.loadDailyCandles('p10', 'A', 2031, 2031)).toHaveLength(1);
    });
  });
}

describeStorageContract('IndexedDbEngineStorage', () => new IndexedDbEngineStorage());
describeStorageContract('InMemoryEngineStorage', () => new InMemoryEngineStorage());

describe('IndexedDbEngineStorage', () => {
  let storage: IndexedDbEngineStorage;
  let database: IDBPDatabase;

  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    storage = new IndexedDbEngineStorage();
    database = await openPortfoligoDb();
  });

  afterEach(async () => {
    database.close();
    await storage.close();
  });

  describe('appendCommand', () => {
    const notCloneable = (() => 0) as unknown as number;

    beforeEach(async () => {
      await storage.appendCommand('p1', command('c1', 100), clock(100));
    });

    // Either write can fail; both orders must leave the earlier write uncommitted.
    it.each([
      ['the command', { ...command('c2', 200), tick: notCloneable }, clock(200)],
      ['the clock', command('c2', 200), { ...clock(200), lastSeenAt: notCloneable }],
    ])('writes neither command nor clock when %s cannot be stored', async (_label, failing, at) => {
      await expect(storage.appendCommand('p1', failing, at)).rejects.toThrow();

      const state = await storage.loadPlayerState('p1');
      expect(state.clock).toEqual(clock(100));
      expect(state.commands).toEqual([command('c1', 100)]);
    });

    it('numbers the commands of each player in log order', async () => {
      await storage.appendCommand('p2', command('x', 100), clock(100));
      await storage.appendCommand('p1', command('c2', 100), clock(100));

      const records = await database.getAll('commands');
      expect(records.map(({ playerId, seq, command: { id } }) => [playerId, seq, id])).toEqual([
        ['p1', 0, 'c1'],
        ['p1', 1, 'c2'],
        ['p2', 0, 'x'],
      ]);
    });
  });

  describe('saveSnapshot', () => {
    it('deletes the commands before the oldest kept snapshot from the store', async () => {
      const game = miniGame();
      const base = game.start.tick;
      for (const [id, tick] of [
        ['c0', base + 50],
        ['c1', base + 150],
        ['c2', base + 200],
      ] as const) {
        await storage.appendCommand('p1', command(id, tick), clock(tick));
      }
      for (const offset of [100, 200, 300, 400]) {
        await storage.saveSnapshot('p1', snapshotAt(game, base + offset));
      }

      expect((await database.getAll('snapshots')).map(({ tick }) => tick - base)).toEqual([
        200, 300, 400,
      ]);
      expect((await database.getAll('commands')).map(({ command: { id } }) => id)).toEqual(['c2']);
    });

    it('writes the transactions only together with the snapshot', async () => {
      const game = miniGame();
      const notCloneable = { ...game.start, commandIds: [() => 0] as unknown as string[] };

      await expect(
        storage.saveSnapshot('p1', notCloneable, { transactions: [salary(1, 0, 'acc-1')] }),
      ).rejects.toThrow();

      expect(await storage.loadTransactions('p1')).toEqual([]);
    });
  });

  describe('discardAfter', () => {
    it('discards journal records after the tick and keeps daily candles', async () => {
      for (const store of JOURNAL_STORES) {
        for (const [playerId, key, tick] of [
          ['p1', 1, 100],
          ['p1', 2, 200],
          ['p1', 3, 201],
          ['p2', 1, 900],
        ] as const) {
          await database.put(store, journalRecord(store, playerId, key, tick));
        }
      }
      const candle = { seriesId: 'A', day: day(2031, 1, 1), open: 1, high: 1, low: 1, close: 1 };
      await storage.saveDailyCandles('p1', [candle]);

      await storage.discardAfter('p1', 200);

      for (const store of JOURNAL_STORES) {
        const records = await database.getAll(store);
        expect(
          records.map(({ playerId, tick }) => [playerId, tick]),
          store,
        ).toEqual([
          ['p1', 100],
          ['p1', 200],
          ['p2', 900],
        ]);
      }
      expect(await database.count('candles')).toBe(1);
    });
  });

  describe('deletePlayer', () => {
    it('empties every worker store of the player and leaves the profile to the UI', async () => {
      const game = miniGame();
      for (const playerId of ['p1', 'p2']) {
        await storage.saveSnapshot(playerId, game.start, { monthStarts: game.monthStarts });
        await storage.appendCommand(playerId, command('c1', 0), clock(0));
        await storage.saveDailyCandles(playerId, [
          { seriesId: 'A', day: day(2031, 1, 1), open: 1, high: 1, low: 1, close: 1 },
        ]);
        for (const store of JOURNAL_STORES) {
          await database.put(store, journalRecord(store, playerId, 1, 0));
        }
      }
      await database.put('players', { id: 'p1', name: 'Eins' });

      await storage.deletePlayer('p1');

      for (const store of WORKER_STORES) {
        const records: { playerId: string }[] = await database.getAll(store);
        expect(records.length, store).toBeGreaterThan(0);
        expect(
          records.every(({ playerId }) => playerId === 'p2'),
          store,
        ).toBe(true);
      }
      expect(await database.get('players', 'p1')).toEqual({ id: 'p1', name: 'Eins' });
    });
  });

  describe('versionchange', () => {
    it('closes its connection so that another tab can upgrade the database', async () => {
      database.close();
      await storage.saveClock('p1', clock(100));
      let blocked = false;
      const upgraded = await openDB(DB_NAME, DB_VERSION + 1, {
        blocked: () => {
          blocked = true;
        },
      });
      expect(blocked).toBe(false);
      expect(upgraded.version).toBe(DB_VERSION + 1);
      upgraded.close();
      database = await openDB(DB_NAME);
    });
  });
});

/** A journal record with its in-line key (TS §9.1) and tick. */
/** A point of the daily series at the end of `dayIndex` with its index as values. */
function dailyPoint(dayIndex: number): DailyPoint {
  return {
    day: dayIndex,
    tick: (dayIndex + 1) * 1_440,
    netWorth: dayIndex,
    cash: dayIndex,
    securities: 0,
    flow: 0,
    totalFlow: 0,
    comparison: 0,
    index: 1,
    skippedDays: 0,
    benchmarkValue: null,
    benchmarkIndex: null,
  };
}

function journalRecord(
  store: string,
  playerId: string,
  key: number,
  tick: number,
): Record<string, unknown> {
  switch (store) {
    case 'transactions':
      return { playerId, seq: key, tick, accountIds: ['giro'] };
    case 'orders':
      return { playerId, orderId: `o${key}`, tick };
    case 'series':
      return { playerId, name: 'wealth', year: 2030 + key, tick };
    default:
      return { playerId, seq: key, tick };
  }
}
