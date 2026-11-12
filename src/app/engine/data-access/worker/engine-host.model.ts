import { SpeedId } from '@app/clock/domain/models/speed.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { PricePortFactory } from '@app/engine/domain/game-engine';
import { GameCommand } from '@app/engine/domain/models/engine-command.model';
import { GameSnapshot } from '@app/engine/domain/models/game-state.model';
import { FactorStateEntry } from '@app/market/domain/models/market-state.model';
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
  /** Clock state on speed and pause changes, periodically, when hidden and on unload (TS §9.2). */
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
  /** Drops all daily candles of the player; they are reproducible (TS §6.8, §9.5). */
  clearCandles(playerId: string): Promise<void>;
  loadPlayerState(playerId: string): Promise<StoredPlayerState>;
  /** Discards the journal records after `tick` (TS §9.2, step 2); daily candles stay. */
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
  /** Interval of the progress events of a jump (TS §3.7). */
  progressIntervalMs: number;
}

export const DEFAULT_ENGINE_HOST_CONFIG: EngineHostConfig = {
  loopIntervalMs: 16,
  passBudgetMs: 8,
  clockPerSecond: 10,
  quotesPerSecond: 4,
  progressIntervalMs: 100,
};

export interface EngineHostOptions {
  /** World of a seed; defaults to the standard world (`generateWorld`). Tests pass the mini world. */
  createWorld?: (seed: string) => GeneratedWorld;
  /** Price port of the engine; defaults to the `PriceSource`. */
  prices?: PricePortFactory;
  config?: Partial<EngineHostConfig>;
  /** Speed of a newly loaded player (TS §3.4); it starts paused (E-02). */
  initialSpeed?: SpeedId;
}
