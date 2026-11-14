import { AccountId } from '@app/banking/domain/models/account.model';
import { Transaction } from '@app/banking/domain/models/ledger.model';
import { SpeedId } from '@app/clock/domain/models/speed.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { PricePortFactory } from '@app/engine/domain/game-engine';
import { GameCommand } from '@app/engine/domain/models/engine-command.model';
import { GameSnapshot } from '@app/engine/domain/models/game-state.model';
import { FactorStateEntry } from '@app/market/domain/models/market-state.model';
import { GameNotification } from '@app/notifications/domain/models/notification.model';
import { PlayerLocks } from '@app/persistence/data-access/locks/player-locks';
import { DailyPoint } from '@app/portfolio/domain/models/performance.model';
import { Cents } from '@app/shared/domain/models/money.model';
import { SeedKey } from '@app/simulation/util/seed';
import { World } from '@app/world/domain/models/world.model';

import { EngineEventMessage } from '../service/engine-service.model';

/** Clock state of a player as the worker stores it (TS §9.1 `runtime`, §8.5). */
export interface StoredClock {
  tick: Tick;
  speed: SpeedId;
  paused: boolean;
  /** Wall-clock time of the write in milliseconds since the Unix epoch. */
  lastSeenAt: number;
  /**
   * Wall-clock time since which the app is hidden, for `backgroundPauseAfter` (TS §3.6, §9.2);
   * missing while visible and in records before AP 6.7.
   */
  hiddenSince?: number;
  /** Net worth at `tick` for the player list (TS §9.1); missing in records before M3. */
  netWorth?: Cents;
}

/** Snapshots kept per player (TS §9.1). */
export const SNAPSHOTS_KEPT = 3;

/** Snapshot as stored, with the versions it was written with (TS §9.1, §15). */
export interface StoredSnapshot {
  tick: Tick;
  schemaVersion: number;
  simVersion: number;
  state: GameSnapshot;
}

/** What `loadPlayerState` returns for a restore (TS §9.2, step 1 and 3). */
export interface StoredPlayerState {
  clock?: StoredClock;
  /** Newest snapshot; older ones are kept only as a reserve. */
  snapshot?: StoredSnapshot;
  /** All stored market states at month starts, ordered by day. */
  monthStarts: FactorStateEntry[];
  /** Logged commands with a tick at or after the snapshot tick (all without a snapshot), in log order. */
  commands: GameCommand[];
}

export interface SaveSnapshotOptions {
  /** Month starts written in the same transaction (usually `engine.monthStartsAfter(lastSaved)`). */
  monthStarts?: readonly FactorStateEntry[];
  /** Clock state written in the same transaction. */
  clock?: StoredClock;
  /**
   * Journal transactions written in the same transaction: those not yet stored, so that a stored
   * snapshot never lacks a transaction up to its tick (TS §9.2).
   */
  transactions?: readonly Transaction[];
  /** Notifications not yet stored, written in the same transaction like `transactions` (TS §9.2). */
  notifications?: readonly GameNotification[];
  /**
   * Oldest notification to keep (TS §9.1): older ones are deleted in the same transaction. The host
   * derives it from the snapshot's own counter, so a restore from this snapshot finds every
   * notification it keeps (`oldestKeptSeq`).
   */
  keepNotificationsFrom?: number;
  /** Points of the daily series not yet stored, written in the same transaction (TS §9.2, AP 5.7). */
  dailyPoints?: readonly DailyPoint[];
}

/**
 * Part of a daily candle of one series (TS §6.8). `NaN` fields leave the stored value unchanged: batch
 * runs write open and close, the high/low job writes high and low, the live close writes all four.
 */
export interface DailyCandlePatch {
  /** Stable series ID (`seriesIds`). */
  seriesId: string;
  /** Market day (days since the epoch). */
  day: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/**
 * Daily candles of one series in one calendar year: `values[4 · slot + f]` with `f` = open, high, low,
 * close and `slot` the market day's index in the year (`candleSlot`, TS §6.8). Missing values are `NaN`.
 */
export interface DailyCandleBucket {
  seriesId: string;
  year: number;
  values: Float32Array;
}

/**
 * Storage port of the worker host (TS §8.5, §9.2): `IndexedDbEngineStorage` in the worker,
 * `InMemoryEngineStorage` in tests that don't need a database.
 */
export interface EngineStorage {
  /**
   * Write-ahead of a game command: the command with its tick and the clock state in one
   * transaction. The host applies the command only after this resolved.
   */
  appendCommand(playerId: string, command: GameCommand, clock: StoredClock): Promise<void>;
  /** Clock state on speed and pause changes and periodically (TS §9.2). */
  saveClock(playerId: string, clock: StoredClock): Promise<void>;
  /**
   * Stores a snapshot with `SIM_VERSION` and `SCHEMA_VERSION`, keeps the newest three and deletes
   * the commands with a tick before the oldest kept snapshot, all in one transaction.
   */
  saveSnapshot(
    playerId: string,
    snapshot: GameSnapshot,
    options?: SaveSnapshotOptions,
  ): Promise<void>;
  /** Journal transactions (TS §7.2, §9.2); a stored running number is overwritten. */
  saveTransactions(playerId: string, transactions: readonly Transaction[]): Promise<void>;
  /** Stored transactions of the player, or of one of its accounts, by running number. */
  loadTransactions(playerId: string, accountId?: AccountId): Promise<Transaction[]>;
  /** Notifications (TS §9.1, §12); a stored running number is overwritten with the same record. */
  saveNotifications(playerId: string, notifications: readonly GameNotification[]): Promise<void>;
  /** Stored notifications of the player by running number. */
  loadNotifications(playerId: string): Promise<GameNotification[]>;
  /** Market states at month starts (E-08); existing days are overwritten. */
  saveMonthStarts(playerId: string, entries: readonly FactorStateEntry[]): Promise<void>;
  /** Merges daily candles into their year buckets in one transaction (see `DailyCandlePatch`). */
  saveDailyCandles(playerId: string, candles: readonly DailyCandlePatch[]): Promise<void>;
  /** Year buckets of a series for the years `fromYear … toYear` (inclusive), ascending. */
  loadDailyCandles(
    playerId: string,
    seriesId: string,
    fromYear: number,
    toYear: number,
  ): Promise<DailyCandleBucket[]>;
  /**
   * Points of the daily series (TS §7.9, §9.1 `series`, AP 5.7), merged into their year records;
   * a stored day is overwritten.
   */
  saveDailyPoints(playerId: string, points: readonly DailyPoint[]): Promise<void>;
  /** Stored points of the days `fromDay … toDay` (inclusive), ascending. */
  loadDailyPoints(playerId: string, fromDay: number, toDay: number): Promise<DailyPoint[]>;
  /** Drops all daily candles of the player; they are reproducible (TS §6.8, §9.5). */
  clearCandles(playerId: string): Promise<void>;
  loadPlayerState(playerId: string): Promise<StoredPlayerState>;
  /**
   * Discards the journal records after `tick` (TS §9.2, step 2); daily candles stay. Year records
   * of the daily series keep their points up to `tick`.
   */
  discardAfter(playerId: string, tick: Tick): Promise<void>;
  /** Deletes all records of the player that the worker owns. */
  deletePlayer(playerId: string): Promise<void>;
}

/** Timer of the worker loop; `setTimeout` in the worker, a manual timer in tests. */
export interface LoopTimer {
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}

/** Process boundaries of the host (TS §14.1, principle 5). */
export interface EngineHostPorts {
  /** Wall clock in milliseconds since the Unix epoch (`Date.now` in the worker). */
  now(): number;
  post(message: EngineEventMessage): void;
  timer: LoopTimer;
  storage: EngineStorage;
  /** Web Lock per player (TS §9.4); without it, the host does not lock. */
  locks?: PlayerLocks;
}

export interface GeneratedWorld {
  seedKey: SeedKey;
  world: World;
}

export interface EngineHostConfig {
  /** Period of the loop (TS §3.5). */
  loopIntervalMs: number;
  /** Time budget of one pass. */
  passBudgetMs: number;
  /** Rate limits of the events (TS §8.4). */
  clockPerSecond: number;
  quotesPerSecond: number;
  /** Rate limit of the `movers` event (TS §8.4). */
  moversPerSecond: number;
  /** Rate limit of the `candle` events, all subscribed charts together per sending (TS §8.4). */
  candlePerSecond: number;
  /** Projections after commands and loading go out at once and count towards the limit. */
  projectionPerSecond: number;
  /** Interval of the progress events of batch runs and the candle job (TS §3.7). */
  progressIntervalMs: number;
  /** Real time between two periodic writes of the clock state (TS §9.2). */
  clockSaveIntervalMs: number;
  /** Real time between two periodic snapshots (TS §9.2). */
  snapshotIntervalMs: number;
  /**
   * Real time between two writes of the buffered daily candles (TS §6.8, §9.2); snapshots, a third
   * calendar year in the buffer and unloading write them earlier.
   */
  candleWriteIntervalMs: number;
  /**
   * Real time after which booked transactions and new notifications are written at the latest
   * (TS §9.2); snapshots write the ones not yet stored as well.
   */
  transactionWriteIntervalMs: number;
  /** Rate limit of the `notification` events (TS §8.3); commands send theirs at once. */
  notificationPerSecond: number;
  /**
   * Upper limit of the candle job's computing time as a share of the wall clock (TS §6.8). 10 %: at
   * 1 w/s, the engine without minute curves plus the job stay below the 15 % of a core of TS §14.3,
   * and the job still adds high and low faster than 1 w/s closes days (5 market days per second at
   * about 13 ms each, 6.5 %).
   */
  backfillShare: number;
  /**
   * Fastest speed at which the live session close computes high and low from the minute curves;
   * above it, the close writes open and close and the candle job adds high and low (TS §6.8, §14.3).
   */
  liveHighLowMaxSpeed: SpeedId;
}

export const DEFAULT_ENGINE_HOST_CONFIG: EngineHostConfig = {
  loopIntervalMs: 16,
  passBudgetMs: 8,
  clockPerSecond: 10,
  quotesPerSecond: 4,
  moversPerSecond: 4,
  candlePerSecond: 4,
  projectionPerSecond: 4,
  progressIntervalMs: 100,
  clockSaveIntervalMs: 5_000,
  snapshotIntervalMs: 30_000,
  candleWriteIntervalMs: 5_000,
  transactionWriteIntervalMs: 1_000,
  notificationPerSecond: 4,
  backfillShare: 0.1,
  liveHighLowMaxSpeed: '1d',
};

export interface EngineHostOptions {
  /** World of a seed; defaults to the standard world (`generateWorld`). Tests pass the mini world. */
  createWorld?: (seed: string) => GeneratedWorld;
  /** Price port of the engine; defaults to the `PriceSource`. */
  prices?: PricePortFactory;
  config?: Partial<EngineHostConfig>;
  /** Speed of a newly loaded player (TS §3.4); it starts paused (E-02). */
  initialSpeed?: SpeedId;
  /**
   * First tick whose market day the background job for daily candles covers (TS §6.8); `null` turns
   * the job off. Defaults to 0, the epoch: the whole prehistory. Tests narrow it, because the job
   * takes seconds even for the mini world.
   */
  candleBackfillFrom?: Tick | null;
}
