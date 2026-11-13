import { IDBFactory } from 'fake-indexeddb';
import fc from 'fast-check';

import { journalBalances } from '@app/banking/domain/ledger-logic';
import { Transaction } from '@app/banking/domain/models/ledger.model';
import { GameEngine } from '@app/engine/domain/game-engine';
import { GameCommand } from '@app/engine/domain/models/engine-command.model';
import { BACKGROUND_MODES, GameSnapshot } from '@app/engine/domain/models/game-state.model';
import { replayCommands } from '@app/engine/domain/replay';
import { miniGame, MiniGame } from '@app/engine/domain/testing/mini-game';
import { SIM_VERSION } from '@app/engine/domain/version';
import { marketChecksum } from '@app/market/domain/market-checksum';
import { seriesIds } from '@app/market/domain/series';
import {
  AUTO_PAUSE_CODES,
  AutoPauseCode,
  GameNotification,
} from '@app/notifications/domain/models/notification.model';
import { openPortfoligoDb } from '@app/persistence/data-access/schema/open-database';
import { FakePlayerLocks } from '@app/persistence/data-access/testing/fake-player-locks';

import { EngineHostConfig, EngineStorage, StoredClock } from './engine-host.model';
import { InMemoryEngineStorage } from './in-memory-engine-storage';
import { IndexedDbEngineStorage } from './indexed-db-engine-storage';
import { SnapshotRecord } from './indexed-db-engine-storage.model';

import { TEST_SEEDS } from '../../../../testing/seeds';
import { FaultyEngineStorage } from '../testing/faulty-engine-storage';
import {
  advance,
  FINE,
  GAME_START,
  gameTick,
  HostHarness,
  HostHarnessPorts,
  MINI_PLAYER as PLAYER,
  runUntil,
} from '../testing/host-harness';

const HOUR_MS = 3_600_000;
/** 22 market days from Monday, 01.04.2030, to Tuesday, 30.04.2030. */
const APRIL_2030_MARKET_DAYS = 22;

/** What decides the game: tick, player, scheduler, applied command IDs and the market checksum. */
function stateKey(state: GameSnapshot): string {
  const { tick: at, player, scheduler, commandIds, market } = state;
  const balances = [...player.balances];
  return JSON.stringify({
    at,
    player: { ...player, balances },
    scheduler,
    commandIds,
    market: marketChecksum(market),
  });
}

/** A new tab: a new host on a new connection to the same database. */
function reload(
  ports: HostHarnessPorts = {},
  config: Partial<EngineHostConfig> = FINE,
): HostHarness {
  return new HostHarness({ config }, { storage: new IndexedDbEngineStorage(), ...ports });
}

async function storedState(storage: EngineStorage = new IndexedDbEngineStorage()) {
  return storage.loadPlayerState(PLAYER.playerId);
}

function catchUps(harness: HostHarness) {
  return harness.progress.filter(({ kind }) => kind === 'catch-up');
}

/** All stored daily candles of 2030 as plain numbers, by series ID. */
async function candles2030(storage: EngineStorage, ids: readonly string[]) {
  const buckets = await Promise.all(
    ids.map((id) => storage.loadDailyCandles(PLAYER.playerId, id, 2030, 2030)),
  );
  return Object.fromEntries(ids.map((id, n) => [id, Array.from(buckets[n][0]?.values ?? [])]));
}

describe('EngineHost persistence', () => {
  let mini: MiniGame;

  beforeAll(() => {
    mini = miniGame(TEST_SEEDS.mini);
  });

  /** The uninterrupted run: the game from its start with `commands` at their ticks, up to `to`. */
  function uninterrupted(commands: readonly GameCommand[], to: number): GameSnapshot {
    return uninterruptedRun(commands, to).snapshot;
  }

  function uninterruptedRun(
    commands: readonly GameCommand[],
    to: number,
  ): { snapshot: GameSnapshot; journal: Transaction[]; notifications: GameNotification[] } {
    const engine = GameEngine.restore(mini.world, mini.start, { monthStarts: mini.monthStarts });
    replayCommands(engine, commands, to);
    return {
      snapshot: engine.snapshot(),
      journal: [...mini.journal, ...engine.drainTransactions()],
      notifications: engine.drainNotifications(),
    };
  }

  /** The stored journal, and its sums equal the balances in the newest snapshot (TS §7.2). */
  async function storedJournal(): Promise<Transaction[]> {
    const journal = await new IndexedDbEngineStorage().loadTransactions(PLAYER.playerId);
    const { snapshot } = await storedState();
    expect(snapshot?.state.player.balances).toEqual(journalBalances(journal));
    return journal;
  }

  describe('reload', () => {
    it('continues tick, speed, pause and background mode', async () => {
      const first = reload();
      await first.send('loadPlayer', PLAYER);
      await first.send('setSpeed', { speed: '1h' });
      await first.send('setBackgroundMode', { mode: 'pause' });
      await first.send('resume', {});
      await advance(first, 2_000);
      await first.send('pause', {});
      expect(await first.send('unloadPlayer', {})).toEqual({ ok: true, data: null });

      const second = reload({ startMs: first.timeline.now() + HOUR_MS });
      expect(await second.send('loadPlayer', PLAYER)).toEqual({
        ok: true,
        data: { playerId: 'p1', tick: GAME_START + 120 },
      });
      await advance(second, 1_000);
      expect(second.clock).toMatchObject({
        tick: GAME_START + 120,
        speed: '1h',
        paused: true,
        backgroundMode: 'pause',
      });
      expect(catchUps(second)).toEqual([]);
    });

    it('starts a new player once: the first snapshot and the clock are stored right away', async () => {
      const first = reload();
      await first.send('loadPlayer', PLAYER);
      const state = await storedState();
      expect(state.snapshot?.tick).toBe(GAME_START);
      expect(state.clock).toMatchObject({ tick: GAME_START, speed: '1min', paused: true });
      expect(state.monthStarts.map((entry) => entry.day)).toEqual(
        mini.monthStarts.map((entry) => entry.day),
      );
    });

    // TS §7.2: the start capital of `MINI_PLAYER` (10.000,00 €) on the salary account `acc-1`
    it('stores the opening balance with the first snapshot and keeps the journal on reload', async () => {
      const first = reload();
      await first.send('loadPlayer', PLAYER);
      const journal = await storedJournal();
      expect(journal).toMatchObject([
        {
          seq: 1,
          tick: GAME_START,
          type: 'opening-balance',
          postings: [
            { account: 'acc-1', amount: 1_000_000, balanceAfter: 1_000_000 },
            { account: 'external:opening-balance', amount: -1_000_000, balanceAfter: null },
          ],
        },
      ]);
      await first.send('setSpeed', { speed: '1d' });
      await first.send('resume', {});
      await advance(first, 3_000);
      await first.send('unloadPlayer', {});
      // The bank run of 01.04.2030, 06:00 booked the living costs of April (TS §7.4).
      const unloaded = await storedJournal();
      expect(unloaded.map(({ seq, type }) => [seq, type])).toEqual([
        [1, 'opening-balance'],
        [2, 'living-costs'],
      ]);

      const second = reload({ startMs: first.timeline.now() });
      await second.send('loadPlayer', PLAYER);
      await second.send('unloadPlayer', {});
      expect(await storedJournal()).toEqual(unloaded);
      expect(await new IndexedDbEngineStorage().loadTransactions('p1', 'acc-1')).toEqual(unloaded);
    });

    it('replays a command after the last snapshot at its original tick after a crash', async () => {
      const first = reload();
      await first.send('loadPlayer', PLAYER);
      await first.send('setSpeed', { speed: '1h' });
      await first.send('resume', {});
      await advance(first, 6_000);
      // The clock was stored after 5 s; the command comes after it and the crash a second later.
      expect(await first.send('setBackgroundMode', { mode: 'pause' })).toEqual({
        ok: true,
        data: { tick: GAME_START + 360 },
      });
      await advance(first, 1_000);
      first.host.dispose();
      const { commands } = await storedState();
      expect(commands).toEqual([
        { id: 't4', tick: GAME_START + 360, type: 'setBackgroundMode', mode: 'pause' },
      ]);

      // The UI saw the clock at GAME_START + 420 (localStorage, TS §9.2).
      const second = reload({ startMs: first.timeline.now() });
      expect(
        await second.send('loadPlayer', { ...PLAYER, minTick: GAME_START + 420 }),
      ).toMatchObject({ ok: true, data: { tick: GAME_START + 420 } });
      await second.host.settled();
      const { snapshot } = await storedState();
      expect(snapshot?.tick).toBe(GAME_START + 420);
      expect(stateKey(snapshot?.state as GameSnapshot)).toBe(
        stateKey(uninterrupted(commands, GAME_START + 420)),
      );
      expect(stateKey(snapshot?.state as GameSnapshot)).not.toBe(
        stateKey(uninterrupted([{ ...commands[0], tick: GAME_START + 420 }], GAME_START + 420)),
      );
    });

    it('discards the journal after the snapshot tick and keeps the daily candles', async () => {
      const first = reload();
      await first.send('loadPlayer', PLAYER);
      await first.send('setSpeed', { speed: '1d' });
      await first.send('resume', {});
      await advance(first, 2_000);
      await first.send('pause', {});
      // The buffered candles go out within 5 s (`candleWriteIntervalMs`).
      await advance(first, 5_000);
      first.host.dispose();
      const database = await openPortfoligoDb();
      // Behind the opening balance (seq 1): one record at the snapshot tick, one after it.
      await database.put('transactions', {
        playerId: 'p1',
        seq: 2,
        tick: GAME_START,
        accountIds: [],
      });
      await database.put('transactions', {
        playerId: 'p1',
        seq: 3,
        tick: GAME_START + 1,
        accountIds: [],
      });
      database.close();

      const second = reload({ startMs: first.timeline.now() });
      await second.send('loadPlayer', PLAYER);
      const check = await openPortfoligoDb();
      expect((await check.getAll('transactions')).map((record) => record.seq)).toEqual([1, 2]);
      check.close();
      // Monday's and Tuesday's sessions closed live: complete candles of the first series.
      const [seriesId] = seriesIds(mini.world.context);
      const [bucket] = await new IndexedDbEngineStorage().loadDailyCandles(
        'p1',
        seriesId,
        2030,
        2030,
      );
      const firstSlot = Array.from(bucket.values).findIndex((value) => !Number.isNaN(value));
      expect(
        Array.from(bucket.values.subarray(firstSlot, firstSlot + 8)).every(Number.isFinite),
      ).toBe(true);
    });
  });

  describe('catch-up', () => {
    async function closedWhileRunning(
      setUp: (harness: HostHarness) => Promise<void>,
    ): Promise<HostHarness> {
      const first = reload();
      await first.send('loadPlayer', PLAYER);
      await first.send('setSpeed', { speed: '1h' });
      await setUp(first);
      await advance(first, 1_000);
      await first.send('unloadPlayer', {});
      return first;
    }

    it('catches up an hour of absence as 60 ticks in batch mode and runs on', async () => {
      const first = await closedWhileRunning(async (harness) => {
        await harness.send('resume', {});
      });
      const second = reload({ startMs: first.timeline.now() + HOUR_MS });
      expect(await second.send('loadPlayer', PLAYER)).toMatchObject({
        ok: true,
        data: { tick: GAME_START + 60 },
      });
      await runUntil(second, () => catchUps(second).some(({ state }) => state === 'done'));
      expect(catchUps(second)).toEqual([
        { kind: 'catch-up', state: 'running', done: 0, total: 60 },
        { kind: 'catch-up', state: 'done', done: 60, total: 60 },
      ]);
      await advance(second, 10);
      expect(second.clock).toMatchObject({ tick: GAME_START + 120, effectiveSpeed: '1h' });
      await second.host.settled();
      expect((await storedState()).snapshot?.tick).toBe(GAME_START + 120);
    });

    it.each([
      [
        'paused',
        async (harness: HostHarness) => {
          await harness.send('pause', {});
        },
      ],
      [
        'in background mode pause',
        async (harness: HostHarness) => {
          await harness.send('setBackgroundMode', { mode: 'pause' });
          await harness.send('resume', {});
        },
      ],
    ])('does not catch up a game that was %s', async (_case, setUp) => {
      const first = await closedWhileRunning(setUp);
      const before = (await storedState()).clock as StoredClock;
      const second = reload({ startMs: first.timeline.now() + HOUR_MS });
      expect(await second.send('loadPlayer', PLAYER)).toMatchObject({
        ok: true,
        data: { tick: before.tick },
      });
      await advance(second, 0);
      expect(catchUps(second)).toEqual([]);
    });

    it('does not catch up when the wall clock was set back', async () => {
      const first = await closedWhileRunning(async (harness) => {
        await harness.send('resume', {});
      });
      const second = reload({ startMs: first.timeline.now() - HOUR_MS });
      await second.send('loadPlayer', PLAYER);
      await advance(second, 0);
      expect(catchUps(second)).toEqual([]);
      expect(second.clock.tick).toBe(GAME_START + 60);
    });

    it('keeps the rest of an interrupted catch-up', async () => {
      const first = await closedWhileRunning(async (harness) => {
        await harness.send('resume', {});
      });
      const second = reload(
        { startMs: first.timeline.now() + 10 * HOUR_MS },
        {
          ...FINE,
          passBudgetMs: 0,
        },
      );
      await second.send('loadPlayer', PLAYER);
      second.timeline.step();
      await second.send('unloadPlayer', {});
      const interrupted = (await storedState()).clock as StoredClock;
      expect(interrupted.tick).toBeLessThan(GAME_START + 660);

      const third = reload({ startMs: second.timeline.now() });
      await third.send('loadPlayer', PLAYER);
      await runUntil(third, () => catchUps(third).some(({ state }) => state === 'done'));
      await advance(third, 10);
      expect(third.clock.tick).toBe(GAME_START + 660);
    });
  });

  describe('versions and locks', () => {
    it('answers player-outdated for a snapshot of another simVersion and keeps it', async () => {
      const locks = new FakePlayerLocks();
      const first = reload({ locks });
      await first.send('loadPlayer', PLAYER);
      await first.send('unloadPlayer', {});
      const database = await openPortfoligoDb();
      const [record] = (await database.getAll('snapshots')) as SnapshotRecord[];
      await database.put('snapshots', { ...record, simVersion: SIM_VERSION + 1 });
      database.close();

      const second = reload({ locks });
      expect(await second.send('loadPlayer', PLAYER)).toMatchObject({
        ok: false,
        error: 'player-outdated',
      });
      expect(locks.held).toEqual([]);
      expect((await storedState()).snapshot?.simVersion).toBe(SIM_VERSION + 1);
    });

    it('answers player-locked while another tab simulates the player', async () => {
      const locks = new FakePlayerLocks();
      const first = reload({ locks });
      const second = reload({ locks });
      await first.send('loadPlayer', PLAYER);
      expect(await second.send('loadPlayer', PLAYER)).toMatchObject({
        ok: false,
        error: 'player-locked',
      });
      await first.send('unloadPlayer', {});
      expect(await second.send('loadPlayer', PLAYER)).toMatchObject({ ok: true });
      second.host.dispose();
      expect(locks.held).toEqual([]);
    });
  });

  describe('periodic writes', () => {
    class RecordingStorage extends InMemoryEngineStorage {
      readonly log: Array<{ kind: 'clock' | 'snapshot'; tick: number }> = [];

      override async saveClock(playerId: string, clock: StoredClock): Promise<void> {
        this.log.push({ kind: 'clock', tick: clock.tick });
        return super.saveClock(playerId, clock);
      }

      override async saveSnapshot(
        ...args: Parameters<InMemoryEngineStorage['saveSnapshot']>
      ): Promise<void> {
        this.log.push({ kind: 'snapshot', tick: args[1].tick });
        return super.saveSnapshot(...args);
      }
    }

    it('stores the clock every 5 s and a snapshot every 30 s', async () => {
      const storage = new RecordingStorage();
      const harness = new HostHarness({ config: FINE }, { storage });
      await harness.send('loadPlayer', PLAYER);
      await harness.send('setSpeed', { speed: '1min' });
      await harness.send('resume', {});
      storage.log.length = 0;
      await advance(harness, 31_000);
      expect(storage.log).toEqual([
        ...[5, 10, 15, 20, 25].map((s) => ({ kind: 'clock', tick: GAME_START + s })),
        { kind: 'snapshot', tick: GAME_START + 30 },
      ]);
    });

    it('stores the clock as soon as a game day passed', async () => {
      const storage = new RecordingStorage();
      const harness = new HostHarness({ config: FINE }, { storage });
      await harness.send('loadPlayer', PLAYER);
      await harness.send('setSpeed', { speed: '1d' });
      await harness.send('resume', {});
      storage.log.length = 0;
      await advance(harness, 3_000);
      expect(storage.log).toEqual(
        [1, 2, 3].map((days) => ({ kind: 'clock', tick: GAME_START + days * 1_440 })),
      );
    });

    it('stores nothing periodically while the game is paused', async () => {
      const storage = new RecordingStorage();
      const harness = new HostHarness({ config: FINE }, { storage });
      await harness.send('loadPlayer', PLAYER);
      storage.log.length = 0;
      await advance(harness, 61_000);
      expect(storage.log).toEqual([]);
    });

    it('stores a snapshot with the clock when the app is hidden', async () => {
      const storage = new RecordingStorage();
      const harness = new HostHarness({ config: FINE }, { storage });
      await harness.send('loadPlayer', PLAYER);
      await harness.send('setSpeed', { speed: '1h' });
      await harness.send('resume', {});
      await advance(harness, 1_000);
      storage.log.length = 0;
      await harness.send('setVisibility', { visible: false });
      expect(storage.log).toEqual([{ kind: 'snapshot', tick: GAME_START + 60 }]);
      expect(storage.clocks.get('p1')).toMatchObject({ tick: GAME_START + 60 });
    });

    it('warns once when a periodic write fails and writes again with the next one', async () => {
      // Writes: 1 snapshot when loading, 2 and 3 clock of setSpeed and resume, 4 the clock at 5 s.
      const inner = new InMemoryEngineStorage();
      const storage = new FaultyEngineStorage(inner, { failAt: 4, mode: 'fail' });
      const harness = new HostHarness({ config: FINE }, { storage });
      await harness.send('loadPlayer', PLAYER);
      await harness.send('setSpeed', { speed: '1min' });
      await harness.send('resume', {});
      await advance(harness, 6_000);
      expect(harness.events('warning').map(({ payload }) => payload)).toEqual([
        { code: 'storage-failed', message: 'injected storage fault at write 4' },
      ]);
      expect(inner.clocks.get('p1')?.tick).toBe(GAME_START);
      await advance(harness, 5_000);
      expect(inner.clocks.get('p1')?.tick).toBe(GAME_START + 10);
      expect(harness.events('warning')).toHaveLength(1);
      expect(harness.clock.tick).toBe(GAME_START + 11);
    });

    // TS §9.2: transactions go out bundled at the latest after 1 s; a failed write keeps them
    it('stores the transactions of the bank run within 1 s and again after a failed write', async () => {
      class FlakyTransactionStorage extends InMemoryEngineStorage {
        failures = 0;

        override async saveTransactions(
          ...args: Parameters<InMemoryEngineStorage['saveTransactions']>
        ): Promise<void> {
          if (this.failures > 0) {
            this.failures--;
            throw new Error('transactions not written');
          }
          return super.saveTransactions(...args);
        }
      }
      const stored = async (storage: EngineStorage) =>
        (await storage.loadTransactions(PLAYER.playerId)).map(({ seq, tick, type }) => ({
          seq,
          tick,
          type,
        }));
      const opening = { seq: 1, tick: GAME_START, type: 'opening-balance' };
      // At 1 d/s the bank run at 06:00 on 01.04.2030 books the living costs after 250 ms.
      const livingCosts = { seq: 2, tick: gameTick(2030, 4, 1, 6), type: 'living-costs' };

      const storage = new FlakyTransactionStorage();
      const harness = new HostHarness({ config: FINE }, { storage });
      await harness.send('loadPlayer', PLAYER);
      await harness.send('setSpeed', { speed: '1d' });
      await harness.send('resume', {});
      await advance(harness, 990);
      expect(await stored(storage)).toEqual([opening]);
      await advance(harness, 10);
      expect(await stored(storage)).toEqual([opening, livingCosts]);

      const flaky = new FlakyTransactionStorage();
      flaky.failures = 1;
      const retrying = new HostHarness({ config: FINE }, { storage: flaky });
      await retrying.send('loadPlayer', PLAYER);
      await retrying.send('setSpeed', { speed: '1d' });
      await retrying.send('resume', {});
      await advance(retrying, 1_000);
      expect(await stored(flaky)).toEqual([opening]);
      expect(retrying.events('warning').map(({ payload }) => payload)).toEqual([
        { code: 'storage-failed', message: 'transactions not written' },
      ]);
      await advance(retrying, 1_000);
      expect(await stored(flaky)).toEqual([opening, livingCosts]);
    });
  });

  describe('daily candles', () => {
    it('rebuilds identical daily candles after the candle store was dropped', async () => {
      const ids = seriesIds(mini.world.context);
      const options = { config: FINE, candleBackfillFrom: GAME_START };
      const storage = new IndexedDbEngineStorage();
      const first = new HostHarness(options, { storage });
      await first.send('loadPlayer', PLAYER);
      // Three days live with high and low, the rest of April in batch mode with the job after it.
      await first.send('setSpeed', { speed: '1d' });
      await first.send('resume', {});
      await advance(first, 3_000);
      await first.send('pause', {});
      await first.send('jumpTo', { target: { kind: 'next-month' } });
      await runUntil(first, () =>
        first.progress.some(({ kind, state }) => kind === 'candles' && state === 'done'),
      );
      await first.send('unloadPlayer', {});
      const written = await candles2030(storage, ids);
      for (const values of Object.values(written)) {
        expect(values.filter(Number.isFinite)).toHaveLength(4 * APRIL_2030_MARKET_DAYS);
      }

      await storage.clearCandles('p1');
      expect(await candles2030(storage, ids)).toEqual(
        Object.fromEntries(ids.map((id) => [id, []])),
      );
      const second = new HostHarness(options, { storage, startMs: first.timeline.now() });
      await second.send('loadPlayer', PLAYER);
      await runUntil(second, () =>
        second.progress.some(({ kind, state }) => kind === 'candles' && state === 'done'),
      );
      expect(second.progress.filter(({ kind }) => kind === 'candles').at(-1)).toEqual({
        kind: 'candles',
        state: 'done',
        done: 2 * APRIL_2030_MARKET_DAYS,
        total: 2 * APRIL_2030_MARKET_DAYS,
      });
      await second.send('unloadPlayer', {});
      expect(await candles2030(storage, ids)).toEqual(written);
    });
  });

  describe('daily candles, buffered', () => {
    /** Counts the candle writes and the days they carry. */
    class CandleCountingStorage extends InMemoryEngineStorage {
      readonly candleWrites: number[][] = [];

      override async saveDailyCandles(
        ...args: Parameters<InMemoryEngineStorage['saveDailyCandles']>
      ): Promise<void> {
        this.candleWrites.push([...new Set(args[1].map(({ day }) => day))]);
        return super.saveDailyCandles(...args);
      }
    }

    /** A host at `speed` from the game start for `ms` of real time, then paused. */
    async function played(
      speed: 'realtime' | '1d' | '1w',
      ms: number,
      storage: EngineStorage,
      candleBackfillFrom: number | null = null,
    ): Promise<HostHarness> {
      const harness = new HostHarness({ config: FINE, candleBackfillFrom }, { storage });
      await harness.send('loadPlayer', PLAYER);
      await harness.send('setSpeed', { speed });
      await harness.send('resume', {});
      await advance(harness, ms);
      await harness.send('pause', {});
      return harness;
    }

    function candlesDone(harness: HostHarness): boolean {
      return harness.progress.some(({ kind, state }) => kind === 'candles' && state === 'done');
    }

    it('writes the candles every 5 s and with each snapshot instead of at every close', async () => {
      const storage = new CandleCountingStorage();
      const harness = new HostHarness({ config: FINE }, { storage });
      await harness.send('loadPlayer', PLAYER);
      await harness.send('setSpeed', { speed: '1d' });
      await harness.send('resume', {});
      await advance(harness, 4_990);
      expect(storage.candleWrites).toEqual([]);
      await advance(harness, 10);
      // Monday, 01.04.2030, to Friday: five sessions closed in one write.
      expect(storage.candleWrites).toHaveLength(1);
      expect(storage.candleWrites[0]).toHaveLength(5);
      await advance(harness, 3_000);
      await harness.send('setVisibility', { visible: false });
      await advance(harness, 10);
      expect(storage.candleWrites).toHaveLength(2);
    });

    it('writes open and close only at 1 w/s and complete candles up to 1 d/s', async () => {
      const ids = seriesIds(mini.world.context);
      const fast = new InMemoryEngineStorage();
      await (await played('1w', 1_000, fast)).send('unloadPlayer', {});
      const slow = new InMemoryEngineStorage();
      await (await played('1d', 7_000, slow)).send('unloadPlayer', {});

      // 1 w/s for one second: the five market days of the first week.
      const fastValues = Object.values(await candles2030(fast, ids)).map((values) =>
        values.filter((value) => !Number.isNaN(value)),
      );
      expect(fastValues.every((values) => values.length === 2 * 5)).toBe(true);
      const slowValues = Object.values(await candles2030(slow, ids)).map((values) =>
        values.filter((value) => !Number.isNaN(value)),
      );
      expect(slowValues.every((values) => values.length === 4 * 5)).toBe(true);
    });

    it('adds high and low after 1 w/s exactly as they are written live', async () => {
      const ids = seriesIds(mini.world.context);
      const live = new InMemoryEngineStorage();
      await (await played('1d', 7_000, live)).send('unloadPlayer', {});
      const fast = new InMemoryEngineStorage();
      const harness = await played('1w', 1_000, fast, GAME_START);
      await runUntil(harness, () => candlesDone(harness));
      await harness.send('unloadPlayer', {});
      expect(await candles2030(fast, ids)).toEqual(await candles2030(live, ids));
    });

    it('finds the candles a crash lost after the next load, opens and closes included', async () => {
      const ids = seriesIds(mini.world.context);
      const reference = new InMemoryEngineStorage();
      await (await played('1d', 3_000, reference)).send('unloadPlayer', {});

      const storage = new IndexedDbEngineStorage();
      const crashing = new HostHarness({ config: FINE }, { storage });
      await crashing.send('loadPlayer', PLAYER);
      await crashing.send('setSpeed', { speed: '1d' });
      await crashing.send('resume', {});
      await advance(crashing, 3_000);
      crashing.host.dispose();
      expect(Object.values(await candles2030(storage, ids)).flat()).toEqual([]);

      const restoring = new HostHarness(
        { config: FINE, candleBackfillFrom: GAME_START },
        { storage, startMs: crashing.timeline.now() },
      );
      await restoring.send('loadPlayer', PLAYER);
      await restoring.send('pause', {});
      await runUntil(restoring, () => candlesDone(restoring));
      await restoring.send('unloadPlayer', {});
      expect(await candles2030(storage, ids)).toEqual(await candles2030(reference, ids));
    });
  });

  describe('crash and restore', () => {
    type Step =
      | { kind: 'advance'; ms: number }
      | { kind: 'mode'; mode: (typeof BACKGROUND_MODES)[number] }
      | { kind: 'auto-pause'; code: AutoPauseCode; enabled: boolean }
      | { kind: 'hide' | 'show' | 'pause' | 'resume' | 'jump' };

    // Jumps to the next month start create notifications (month-closed, AP 3.6), and an auto-pause
    // of that code ends them there.
    const arbStep: fc.Arbitrary<Step> = fc.oneof(
      fc.record({ kind: fc.constant('advance' as const), ms: fc.integer({ min: 0, max: 12_000 }) }),
      fc.record({ kind: fc.constant('mode' as const), mode: fc.constantFrom(...BACKGROUND_MODES) }),
      fc.record({
        kind: fc.constant('auto-pause' as const),
        code: fc.constantFrom<AutoPauseCode>('month-closed', ...AUTO_PAUSE_CODES.slice(0, 2)),
        enabled: fc.boolean(),
      }),
      fc.record({ kind: fc.constantFrom('hide' as const, 'show' as const) }),
      fc.record({ kind: fc.constantFrom('pause' as const, 'resume' as const) }),
      { weight: 2, arbitrary: fc.record({ kind: fc.constant('jump' as const) }) },
    );

    it('restores the uninterrupted run with exactly the confirmed commands after a crash anywhere', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbStep, { minLength: 1, maxLength: 8 }),
          fc.integer({ min: 1, max: 16 }),
          async (steps, failAt) => {
            globalThis.indexedDB = new IDBFactory();
            const inner = new IndexedDbEngineStorage();
            const storage = new FaultyEngineStorage(inner, { failAt, mode: 'crash' });
            const crashing = new HostHarness({ config: FINE }, { storage });
            const confirmed: GameCommand[] = [];
            await crashing.send('loadPlayer', PLAYER);
            await crashing.send('setSpeed', { speed: '1h' });
            await crashing.send('resume', {});
            for (const step of steps) {
              if (step.kind === 'advance') {
                await advance(crashing, step.ms);
              } else if (step.kind === 'mode') {
                const reply = await crashing.send('setBackgroundMode', { mode: step.mode });
                if (reply.ok) {
                  const { tick: at } = reply.data as { tick: number };
                  confirmed.push({
                    id: crashing.lastId,
                    tick: at,
                    type: 'setBackgroundMode',
                    mode: step.mode,
                  });
                }
              } else if (step.kind === 'auto-pause') {
                const reply = await crashing.send('setAutoPause', {
                  code: step.code,
                  enabled: step.enabled,
                });
                if (reply.ok) {
                  const { tick: at } = reply.data as { tick: number };
                  confirmed.push({
                    id: crashing.lastId,
                    tick: at,
                    type: 'setAutoPause',
                    code: step.code,
                    enabled: step.enabled,
                  });
                }
              } else if (step.kind === 'jump') {
                const ended = (): number =>
                  crashing.progress.filter(
                    ({ kind, state }) => kind === 'jump' && state !== 'running',
                  ).length;
                const before = ended();
                const reply = await crashing.send('jumpTo', { target: { kind: 'next-month' } });
                if (reply.ok) {
                  await runUntil(crashing, () => ended() > before);
                }
              } else if (step.kind === 'hide' || step.kind === 'show') {
                await crashing.send('setVisibility', { visible: step.kind === 'show' });
              } else {
                await crashing.send(step.kind, {});
              }
            }
            crashing.host.dispose();

            const restoring = new HostHarness(
              { config: FINE },
              { storage: new IndexedDbEngineStorage(), startMs: crashing.timeline.now() },
            );
            expect(await restoring.send('loadPlayer', PLAYER)).toMatchObject({ ok: true });
            // Until the catch-up (if any) is done; it writes a snapshot at its end.
            await runUntil(
              restoring,
              () =>
                catchUps(restoring).every(({ state }) => state !== 'running') ||
                catchUps(restoring).some(({ state }) => state === 'done'),
            );
            restoring.host.dispose();
            await restoring.host.settled();
            const { snapshot, commands } = await storedState();
            const restored = snapshot?.state as GameSnapshot;
            // The log keeps the commands from the newest snapshot on; older ones are in it.
            const logged = (command: GameCommand): string => `${command.id}@${command.tick}`;
            expect(confirmed.map(logged)).toEqual(expect.arrayContaining(commands.map(logged)));
            const reference = uninterruptedRun(confirmed, restored.tick);
            expect(stateKey(restored)).toBe(stateKey(reference.snapshot));
            expect(await storedJournal()).toEqual(reference.journal);
            expect(await new IndexedDbEngineStorage().loadNotifications(PLAYER.playerId)).toEqual(
              reference.notifications,
            );
          },
        ),
        { numRuns: 12 },
      );
    });
  });
});
