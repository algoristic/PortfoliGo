import { SpeedId } from '@app/clock/domain/models/speed.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { PricePortFactory } from '@app/engine/domain/game-engine';
import { GameCommand } from '@app/engine/domain/models/engine-command.model';
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

/**
 * Storage port of the worker host (TS §8.5, §9.2). AP 2.2 uses `InMemoryEngineStorage`; AP 2.3
 * implements it on IndexedDB and adds snapshots, month starts and daily candles.
 */
export interface EngineStorage {
  /**
   * Write-ahead of a game command: the command with its tick and the clock state in one
   * transaction. The host applies the command only after this resolved.
   */
  appendCommand(playerId: string, command: GameCommand, clock: StoredClock): Promise<void>;
  /** Clock state on speed and pause changes, when hidden and on unload (TS §9.2). */
  saveClock(playerId: string, clock: StoredClock): Promise<void>;
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
