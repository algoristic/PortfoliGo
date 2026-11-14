import { Transaction } from '@app/banking/domain/models/ledger.model';
import { GameCommand } from '@app/engine/domain/models/engine-command.model';
import { GameSnapshot } from '@app/engine/domain/models/game-state.model';
import { FactorStateEntry } from '@app/market/domain/models/market-state.model';
import { GameNotification } from '@app/notifications/domain/models/notification.model';
import { DailyPoint } from '@app/portfolio/domain/models/performance.model';
import { Bank } from '@app/world/domain/models/bank.model';

import { DailyCandlePatch, SaveSnapshotOptions, StoredClock } from './engine-host.model';
import { InMemoryEngineStorage } from './in-memory-engine-storage';

import {
  advance,
  FINE,
  GAME_START,
  HostHarness,
  MINI_PLAYER as PLAYER,
} from '../testing/host-harness';
import { generateMiniWorld } from '../testing/in-process-engine-worker';

// Robustness of the worker host (AP 6.4, TS §8.5, §9.5) on the mini world `mini-1`: replies to the
// game commands of a failed worker, and a full storage.

const { world } = generateMiniWorld(PLAYER.seed);
const HOME = world.banks.find(({ type }) => type === 'branch') as Bank;

/**
 * Storage that is full (`QuotaExceededError`): `until-candles-cleared` until the daily candles are
 * deleted, `always` for every write but deletions.
 */
class FullStorage extends InMemoryEngineStorage {
  full: 'until-candles-cleared' | 'always' | null = null;
  candleWrites = 0;
  snapshotWrites = 0;
  clearedCandles = 0;

  override async appendCommand(
    playerId: string,
    command: GameCommand,
    clock: StoredClock,
  ): Promise<void> {
    this.#check();
    return super.appendCommand(playerId, command, clock);
  }

  override async saveClock(playerId: string, clock: StoredClock): Promise<void> {
    this.#check();
    return super.saveClock(playerId, clock);
  }

  override async saveSnapshot(
    playerId: string,
    snapshot: GameSnapshot,
    options?: SaveSnapshotOptions,
  ): Promise<void> {
    this.#check();
    this.snapshotWrites++;
    return super.saveSnapshot(playerId, snapshot, options);
  }

  override async saveTransactions(
    playerId: string,
    transactions: readonly Transaction[],
  ): Promise<void> {
    this.#check();
    return super.saveTransactions(playerId, transactions);
  }

  override async saveNotifications(
    playerId: string,
    notifications: readonly GameNotification[],
  ): Promise<void> {
    this.#check();
    return super.saveNotifications(playerId, notifications);
  }

  override async saveDailyPoints(playerId: string, points: readonly DailyPoint[]): Promise<void> {
    this.#check();
    return super.saveDailyPoints(playerId, points);
  }

  override async saveMonthStarts(
    playerId: string,
    entries: readonly FactorStateEntry[],
  ): Promise<void> {
    this.#check();
    return super.saveMonthStarts(playerId, entries);
  }

  override async saveDailyCandles(
    playerId: string,
    candles: readonly DailyCandlePatch[],
  ): Promise<void> {
    this.#check();
    this.candleWrites++;
    return super.saveDailyCandles(playerId, candles);
  }

  override async clearCandles(playerId: string): Promise<void> {
    this.clearedCandles++;
    if (this.full === 'until-candles-cleared') {
      this.full = null;
    }
    return super.clearCandles(playerId);
  }

  #check(): void {
    if (this.full !== null) {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    }
  }
}

describe('EngineHost recovery', () => {
  describe('restored replies (TS §8.5)', () => {
    it('answers the pending commands found in the command log before the reply of loadPlayer', async () => {
      const storage = new InMemoryEngineStorage();
      const failed = new HostHarness({ config: FINE }, { storage });
      await failed.send('loadPlayer', PLAYER);
      const opened = await failed.send('openAccount', { bankId: HOME.id, kind: 'current' });
      const openedId = failed.lastId;
      failed.host.dispose();

      const restored = new HostHarness({ config: FINE }, { storage });
      const loaded = await restored.send('loadPlayer', {
        ...PLAYER,
        pendingCommandIds: [openedId, 'u-lost-1'],
      });
      expect(loaded).toEqual({ ok: true, data: { playerId: 'p1', tick: GAME_START } });
      expect(opened).toEqual({
        ok: true,
        data: { tick: GAME_START, accountId: 'acc-2', depotId: null },
      });
      expect(restored.replyTo(openedId)).toEqual(opened);
      expect(() => restored.replyTo('u-lost-1')).toThrow('no reply to u-lost-1');
      const replies = restored.events('reply').map(({ payload }) => payload);
      expect(replies).toEqual([opened, loaded]);
    });

    it('restores the rejection of a command the engine refused', async () => {
      const storage = new InMemoryEngineStorage();
      const failed = new HostHarness({ config: FINE }, { storage });
      await failed.send('loadPlayer', PLAYER);
      const refused = await failed.send('setSalaryAccount', { accountId: 'acc-9' });
      const refusedId = failed.lastId;
      failed.host.dispose();

      const restored = new HostHarness({ config: FINE }, { storage });
      await restored.send('loadPlayer', { ...PLAYER, pendingCommandIds: [refusedId] });
      expect(refused).toMatchObject({ ok: false, error: 'unknown-account' });
      expect(restored.replyTo(refusedId)).toEqual(refused);
    });
  });

  describe('full storage (TS §9.5)', () => {
    /** Runs the game at one day per second until daily candles were written. */
    async function playWithCandles(harness: HostHarness, storage: FullStorage): Promise<void> {
      await harness.send('loadPlayer', PLAYER);
      await harness.send('setSpeed', { speed: '1d' });
      await harness.send('resume', {});
      await advance(harness, 6_000);
      expect(storage.candleWrites).toBeGreaterThan(0);
    }

    it('drops the daily candles once and writes the command again', async () => {
      const storage = new FullStorage();
      const harness = new HostHarness({ config: FINE }, { storage });
      await playWithCandles(harness, storage);
      const candleWrites = storage.candleWrites;

      storage.full = 'until-candles-cleared';
      const reply = await harness.send('setBackgroundMode', { mode: 'pause' });
      expect(reply).toMatchObject({ ok: true });
      expect(storage.clearedCandles).toBe(1);
      expect(storage.commands.map(({ command }) => command.id)).toEqual([harness.lastId]);

      await advance(harness, 12_000);
      expect(harness.clock.paused).toBe(false);
      expect(harness.events('warning')).toEqual([]);
      // No candles any more in this session: the store would fill up again.
      expect(storage.candleWrites).toBe(candleWrites);
    });

    it('lets a write that failed while the candles were dropped try again', async () => {
      const storage = new FullStorage();
      const harness = new HostHarness({ config: FINE }, { storage });
      await playWithCandles(harness, storage);
      await advance(harness, 3_000);
      const snapshots = storage.snapshotWrites;

      // Hiding writes the buffered candles and a snapshot at once; both fail first.
      storage.full = 'until-candles-cleared';
      await harness.send('setVisibility', { visible: false });
      await harness.host.settled();
      expect(storage.clearedCandles).toBe(1);
      expect(storage.snapshotWrites).toBe(snapshots + 1);
      expect(harness.events('warning')).toEqual([]);
    });

    it('pauses and warns once when it stays full, and keeps every accepted command', async () => {
      const storage = new FullStorage();
      const harness = new HostHarness({ config: FINE }, { storage });
      await playWithCandles(harness, storage);
      const accepted = await harness.send('setBackgroundMode', { mode: 'keep-speed' });
      expect(accepted).toMatchObject({ ok: true });

      storage.full = 'always';
      await advance(harness, 6_000);
      // The pause goes out with the next pass after the failed write.
      await advance(harness, 100);
      expect(storage.clearedCandles).toBe(1);
      expect(harness.clock.paused).toBe(true);
      const pausedAt = harness.clock.tick;
      expect(harness.events('warning').map(({ payload }) => payload.code)).toEqual([
        'storage-full',
      ]);

      expect(await harness.send('setBackgroundMode', { mode: 'pause' })).toMatchObject({
        ok: false,
        error: 'storage-failed',
      });
      await advance(harness, 6_000);
      expect(harness.clock.tick).toBe(pausedAt);
      expect(harness.events('warning')).toHaveLength(1);

      // A reload finds the accepted command, not the refused one.
      harness.host.dispose();
      storage.full = null;
      const reloaded = new HostHarness({ config: FINE }, { storage });
      await reloaded.send('loadPlayer', PLAYER);
      await advance(reloaded, 1_000);
      expect(reloaded.clock.backgroundMode).toBe('keep-speed');
    });

    it('warns with storage-failed and keeps running for other write errors', async () => {
      const storage = new FullStorage();
      const harness = new HostHarness({ config: FINE }, { storage });
      await playWithCandles(harness, storage);
      storage.saveClock = () => Promise.reject(new Error('disk on fire'));
      await advance(harness, 6_000);
      expect(harness.events('warning').map(({ payload }) => payload.code)).toEqual([
        'storage-failed',
      ]);
      expect(harness.clock.paused).toBe(false);
      expect(storage.clearedCandles).toBe(0);
    });
  });
});
