import { IDBPDatabase, IDBPTransaction } from 'idb';

import { isPlayerAccount } from '@app/banking/domain/ledger-logic';
import { AccountId } from '@app/banking/domain/models/account.model';
import { Transaction } from '@app/banking/domain/models/ledger.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { GameCommand } from '@app/engine/domain/models/engine-command.model';
import { GameSnapshot } from '@app/engine/domain/models/game-state.model';
import { SCHEMA_VERSION, SIM_VERSION } from '@app/engine/domain/version';
import { FactorStateEntry } from '@app/market/domain/models/market-state.model';
import { GameNotification } from '@app/notifications/domain/models/notification.model';
import {
  JOURNAL_STORES,
  TRANSACTIONS_BY_ACCOUNT_INDEX,
  WorkerStoreName,
} from '@app/persistence/data-access/schema/idb-schema';
import { openPortfoligoDb } from '@app/persistence/data-access/schema/open-database';
import {
  deletePlayerRecords,
  playerKeyRange,
} from '@app/persistence/data-access/schema/player-records';
import { DailyPoint } from '@app/portfolio/domain/models/performance.model';

import {
  candleYear,
  createCandleValues,
  isCompleteCandleBucket,
  patchCandleValues,
  weeklyCandleValues,
} from './daily-candles.utils';
import { mergePoints, pointsByYear, pointYear } from './daily-series.utils';
import {
  CandleConsolidationResult,
  DailyCandleBucket,
  DailyCandlePatch,
  EngineStorage,
  SaveSnapshotOptions,
  SNAPSHOTS_KEPT,
  StoredClock,
  StoredPlayerState,
  WeeklyCandleBucket,
} from './engine-host.model';
import {
  CandleRecord,
  CommandRecord,
  JournalRecord,
  MarketStateRecord,
  NotificationRecord,
  PERFORMANCE_SERIES,
  RuntimeRecord,
  SeriesRecord,
  SnapshotRecord,
  TransactionRecord,
} from './indexed-db-engine-storage.model';

type WriteTransaction = IDBPTransaction<unknown, WorkerStoreName[], 'readwrite'>;
type ReadTransaction = IDBPTransaction<unknown, WorkerStoreName[], 'readonly'>;

function runtimeRecord(playerId: string, clock: StoredClock): RuntimeRecord {
  const { tick, speed, paused, lastSeenAt, hiddenSince, netWorth } = clock;
  return {
    playerId,
    tick,
    speed,
    paused,
    lastSeenAt,
    ...(hiddenSince === undefined ? {} : { hiddenSince }),
    ...(netWorth === undefined ? {} : { netWorth }),
  };
}

async function putMonthStarts(
  transaction: WriteTransaction,
  playerId: string,
  entries: readonly FactorStateEntry[],
): Promise<void> {
  const store = transaction.objectStore('marketStates');
  for (const state of entries) {
    await store.put({ playerId, day: state.day, state } satisfies MarketStateRecord);
  }
}

async function putTransactions(
  transaction: WriteTransaction,
  playerId: string,
  transactions: readonly Transaction[],
): Promise<void> {
  const store = transaction.objectStore('transactions');
  for (const booked of transactions) {
    const accounts = new Set(booked.postings.map((posting) => posting.account));
    const accountIds = [...accounts]
      .filter(isPlayerAccount)
      .map((id): [string, AccountId] => [playerId, id]);
    await store.put({ ...booked, playerId, accountIds } satisfies TransactionRecord);
  }
}

async function putNotifications(
  transaction: WriteTransaction,
  playerId: string,
  notifications: readonly GameNotification[],
): Promise<void> {
  const store = transaction.objectStore('notifications');
  for (const notification of notifications) {
    await store.put({ ...notification, playerId } satisfies NotificationRecord);
  }
}

async function putDailyPoints(
  transaction: WriteTransaction,
  playerId: string,
  points: readonly DailyPoint[],
): Promise<void> {
  const store = transaction.objectStore('series');
  for (const [year, added] of pointsByYear(points)) {
    const stored = (await store.get([playerId, PERFORMANCE_SERIES, year])) as
      SeriesRecord | undefined;
    const merged = mergePoints(stored?.points ?? [], added);
    await store.put({
      playerId,
      name: PERFORMANCE_SERIES,
      year,
      tick: merged[merged.length - 1].tick,
      points: merged,
    } satisfies SeriesRecord);
  }
}

function fromTransactionRecord(record: TransactionRecord): Transaction {
  const { playerId: _playerId, accountIds: _accountIds, ...transaction } = record;
  return transaction;
}

/**
 * Storage port on IndexedDB (TS §9.1, §9.2), framework-free for the engine worker. Every method is
 * one transaction; a failing write aborts it, so nothing of it is stored.
 */
export class IndexedDbEngineStorage implements EngineStorage {
  readonly #open: () => Promise<IDBPDatabase>;
  #database: Promise<IDBPDatabase> | undefined;

  constructor(open: () => Promise<IDBPDatabase> = openPortfoligoDb) {
    this.#open = open;
  }

  async close(): Promise<void> {
    const database = this.#database;
    this.#database = undefined;
    (await database)?.close();
  }

  appendCommand(playerId: string, command: GameCommand, clock: StoredClock): Promise<void> {
    // Write-ahead (TS §8.5): command and clock commit together and durably.
    return this.#write(
      ['runtime', 'commands'],
      async (transaction) => {
        const commands = transaction.objectStore('commands');
        const last = await commands.openCursor(playerKeyRange(playerId), 'prev');
        const seq = last === null ? 0 : (last.value as CommandRecord).seq + 1;
        await transaction.objectStore('runtime').put(runtimeRecord(playerId, clock));
        await commands.add({ playerId, seq, tick: command.tick, command } satisfies CommandRecord);
      },
      'strict',
    );
  }

  saveClock(playerId: string, clock: StoredClock): Promise<void> {
    return this.#write(['runtime'], async (transaction) => {
      await transaction.objectStore('runtime').put(runtimeRecord(playerId, clock));
    });
  }

  saveSnapshot(
    playerId: string,
    snapshot: GameSnapshot,
    options: SaveSnapshotOptions = {},
  ): Promise<void> {
    const {
      monthStarts = [],
      clock,
      transactions = [],
      notifications = [],
      keepNotificationsFrom,
      dailyPoints = [],
    } = options;
    return this.#write(
      [
        'snapshots',
        'commands',
        'marketStates',
        'runtime',
        'transactions',
        'notifications',
        'series',
      ],
      async (transaction) => {
        await putTransactions(transaction, playerId, transactions);
        await putDailyPoints(transaction, playerId, dailyPoints);
        await putNotifications(transaction, playerId, notifications);
        if (keepNotificationsFrom !== undefined) {
          await transaction
            .objectStore('notifications')
            .delete(IDBKeyRange.bound([playerId], [playerId, keepNotificationsFrom], false, true));
        }
        const snapshots = transaction.objectStore('snapshots');
        await snapshots.put({
          playerId,
          tick: snapshot.tick,
          schemaVersion: SCHEMA_VERSION,
          simVersion: SIM_VERSION,
          state: snapshot,
        } satisfies SnapshotRecord);
        await putMonthStarts(transaction, playerId, monthStarts);
        if (clock !== undefined) {
          await transaction.objectStore('runtime').put(runtimeRecord(playerId, clock));
        }
        const keys = (await snapshots.getAllKeys(playerKeyRange(playerId))) as [string, Tick][];
        const dropped = keys.slice(0, Math.max(0, keys.length - SNAPSHOTS_KEPT));
        for (const key of dropped) {
          await snapshots.delete(key);
        }
        const oldestKeptTick = keys[dropped.length][1];
        let cursor = await transaction.objectStore('commands').openCursor(playerKeyRange(playerId));
        while (cursor !== null) {
          if ((cursor.value as CommandRecord).tick < oldestKeptTick) {
            await cursor.delete();
          }
          cursor = await cursor.continue();
        }
      },
      'strict',
    );
  }

  saveTransactions(playerId: string, transactions: readonly Transaction[]): Promise<void> {
    return this.#write(['transactions'], (transaction) =>
      putTransactions(transaction, playerId, transactions),
    );
  }

  async loadTransactions(playerId: string, accountId?: AccountId): Promise<Transaction[]> {
    const database = await this.#db();
    const records = (
      accountId === undefined
        ? await database.getAll('transactions', playerKeyRange(playerId))
        : await database.getAllFromIndex(
            'transactions',
            TRANSACTIONS_BY_ACCOUNT_INDEX,
            IDBKeyRange.only([playerId, accountId]),
          )
    ) as TransactionRecord[];
    return records.map(fromTransactionRecord);
  }

  saveNotifications(playerId: string, notifications: readonly GameNotification[]): Promise<void> {
    return this.#write(['notifications'], (transaction) =>
      putNotifications(transaction, playerId, notifications),
    );
  }

  async loadNotifications(playerId: string): Promise<GameNotification[]> {
    const database = await this.#db();
    const records = (await database.getAll(
      'notifications',
      playerKeyRange(playerId),
    )) as NotificationRecord[];
    return records.map(
      ({ playerId: _playerId, ...notification }) => notification as GameNotification,
    );
  }

  saveMonthStarts(playerId: string, entries: readonly FactorStateEntry[]): Promise<void> {
    return this.#write(['marketStates'], (transaction) =>
      putMonthStarts(transaction, playerId, entries),
    );
  }

  saveDailyCandles(playerId: string, candles: readonly DailyCandlePatch[]): Promise<void> {
    const buckets = new Map<
      string,
      { seriesId: string; year: number; patches: DailyCandlePatch[] }
    >();
    for (const patch of candles) {
      const year = candleYear(patch.day);
      const id = JSON.stringify([patch.seriesId, year]);
      const bucket = buckets.get(id) ?? { seriesId: patch.seriesId, year, patches: [] };
      bucket.patches.push(patch);
      buckets.set(id, bucket);
    }
    return this.#write(['candles'], async (transaction) => {
      const store = transaction.objectStore('candles');
      for (const { seriesId, year, patches } of buckets.values()) {
        const stored = (await store.get([playerId, seriesId, '1d', year])) as
          CandleRecord | undefined;
        const values = stored?.values ?? createCandleValues(year);
        for (const patch of patches) {
          patchCandleValues(values, patch);
        }
        await store.put({
          playerId,
          instrumentId: seriesId,
          resolution: '1d',
          bucket: year,
          values,
        } satisfies CandleRecord);
      }
    });
  }

  async loadDailyCandles(
    playerId: string,
    seriesId: string,
    fromYear: number,
    toYear: number,
  ): Promise<DailyCandleBucket[]> {
    const database = await this.#db();
    const records = (await database.getAll(
      'candles',
      IDBKeyRange.bound([playerId, seriesId, '1d', fromYear], [playerId, seriesId, '1d', toYear]),
    )) as CandleRecord[];
    return records.map(({ bucket, values }) => ({ seriesId, year: bucket, values }));
  }

  async loadWeeklyCandles(
    playerId: string,
    seriesId: string,
    fromYear: number,
    toYear: number,
  ): Promise<WeeklyCandleBucket[]> {
    const database = await this.#db();
    const records = (await database.getAll(
      'candles',
      IDBKeyRange.bound([playerId, seriesId, '1w', fromYear], [playerId, seriesId, '1w', toYear]),
    )) as CandleRecord[];
    return records.map(({ bucket, values }) => ({ seriesId, year: bucket, values }));
  }

  async consolidateCandles(
    playerId: string,
    seriesIds: readonly string[],
    year: number,
  ): Promise<CandleConsolidationResult> {
    let result: CandleConsolidationResult = 'none';
    await this.#write(['candles'], async (transaction) => {
      const store = transaction.objectStore('candles');
      const daily = (await Promise.all(
        seriesIds.map((seriesId) => store.get([playerId, seriesId, '1d', year])),
      )) as Array<CandleRecord | undefined>;
      if (daily.every((record) => record === undefined)) {
        result = 'none';
        return;
      }
      if (daily.some((record) => record === undefined || !isCompleteCandleBucket(record.values))) {
        result = 'incomplete';
        return;
      }
      for (const [s, seriesId] of seriesIds.entries()) {
        await store.put({
          playerId,
          instrumentId: seriesId,
          resolution: '1w',
          bucket: year,
          values: weeklyCandleValues(year, (daily[s] as CandleRecord).values),
        } satisfies CandleRecord);
        await store.delete([playerId, seriesId, '1d', year]);
      }
      result = 'consolidated';
    });
    return result;
  }

  saveDailyPoints(playerId: string, points: readonly DailyPoint[]): Promise<void> {
    return this.#write(['series'], (transaction) => putDailyPoints(transaction, playerId, points));
  }

  async loadDailyPoints(playerId: string, fromDay: number, toDay: number): Promise<DailyPoint[]> {
    if (toDay < fromDay) {
      return [];
    }
    const database = await this.#db();
    const records = (await database.getAll(
      'series',
      IDBKeyRange.bound(
        [playerId, PERFORMANCE_SERIES, pointYear(fromDay)],
        [playerId, PERFORMANCE_SERIES, pointYear(toDay)],
      ),
    )) as SeriesRecord[];
    return records.flatMap(({ points }) =>
      points.filter(({ day }) => day >= fromDay && day <= toDay),
    );
  }

  clearCandles(playerId: string): Promise<void> {
    return this.#write(['candles'], async (transaction) => {
      await transaction.objectStore('candles').delete(playerKeyRange(playerId));
    });
  }

  async loadPlayerState(playerId: string): Promise<StoredPlayerState> {
    const database = await this.#db();
    const transaction = database.transaction(
      ['runtime', 'snapshots', 'marketStates', 'commands'],
      'readonly',
    ) as unknown as ReadTransaction;
    const range = playerKeyRange(playerId);
    const runtime = (await transaction.objectStore('runtime').get(playerId)) as
      RuntimeRecord | undefined;
    const newest = await transaction.objectStore('snapshots').openCursor(range, 'prev');
    const monthStarts = (await transaction
      .objectStore('marketStates')
      .getAll(range)) as MarketStateRecord[];
    const commands = (await transaction.objectStore('commands').getAll(range)) as CommandRecord[];
    await transaction.done;

    const state: StoredPlayerState = {
      monthStarts: monthStarts.map((record) => record.state),
      commands: [],
    };
    if (runtime !== undefined) {
      const { playerId: _playerId, ...clock } = runtime;
      state.clock = clock;
    }
    let fromTick = -Infinity;
    if (newest !== null) {
      const { playerId: _playerId, ...snapshot } = newest.value as SnapshotRecord;
      state.snapshot = snapshot;
      fromTick = snapshot.tick;
    }
    state.commands = commands
      .filter((record) => record.tick >= fromTick)
      .map((record) => record.command);
    return state;
  }

  discardAfter(playerId: string, tick: Tick): Promise<void> {
    return this.#write([...JOURNAL_STORES], async (transaction) => {
      for (const name of JOURNAL_STORES) {
        let cursor = await transaction.objectStore(name).openCursor(playerKeyRange(playerId));
        while (cursor !== null) {
          const record = cursor.value as JournalRecord;
          if (record.tick > tick) {
            const points = name === 'series' ? (record as Partial<SeriesRecord>).points : undefined;
            const kept = (points ?? []).filter((point) => point.tick <= tick);
            if (kept.length === 0) {
              await cursor.delete();
            } else {
              await cursor.update({
                ...(record as SeriesRecord),
                tick: kept[kept.length - 1].tick,
                points: kept,
              } satisfies SeriesRecord);
            }
          }
          cursor = await cursor.continue();
        }
      }
    });
  }

  async deletePlayer(playerId: string): Promise<void> {
    await deletePlayerRecords(await this.#db(), playerId);
  }

  /**
   * The connection, opened on first use. When another tab wants to upgrade the database, the
   * connection closes so that the upgrade is not blocked; the next call opens a new one. A failed
   * open is not kept.
   */
  #db(): Promise<IDBPDatabase> {
    if (this.#database === undefined) {
      const opened = this.#open().then((database) => {
        database.addEventListener('versionchange', () => {
          database.close();
          if (this.#database === opened) {
            this.#database = undefined;
          }
        });
        return database;
      });
      opened.catch(() => {
        if (this.#database === opened) {
          this.#database = undefined;
        }
      });
      this.#database = opened;
    }
    return this.#database;
  }

  /**
   * Runs `body` in one read-write transaction. If it fails, the transaction is aborted (a write that
   * throws synchronously, e.g. `DataCloneError`, would otherwise let the earlier writes commit).
   */
  async #write(
    stores: WorkerStoreName[],
    body: (transaction: WriteTransaction) => Promise<void>,
    durability: IDBTransactionDurability = 'default',
  ): Promise<void> {
    const database = await this.#db();
    const transaction = database.transaction(stores, 'readwrite', {
      durability,
    }) as unknown as WriteTransaction;
    const done = transaction.done;
    done.catch(() => undefined);
    try {
      await body(transaction);
      await done;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction has already finished or aborted.
      }
      throw error;
    }
  }
}
