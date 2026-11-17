import { accountViews, netWorth } from '@app/engine/domain/account-projection';
import { GameEngine, PricePortFactory } from '@app/engine/domain/game-engine';
import { createGameWorld } from '@app/engine/domain/game-world';
import { GameWorld } from '@app/engine/domain/models/game-world.model';
import { SCHEMA_VERSION, SIM_VERSION } from '@app/engine/domain/version';
import { oldestKeptSeq } from '@app/notifications/domain/read-state-logic';
import { PlayerLock, PlayerLocks } from '@app/persistence/data-access/locks/player-locks';
import { PlayerExport } from '@app/players/domain/models/player-export.model';
import { decodePlayerExport } from '@app/players/domain/player-export-logic';
import { importedGame, MarketHistoryRun } from '@app/players/domain/player-import-logic';
import { deriveSeedKey, SeedKey } from '@app/simulation/util/seed';
import { World } from '@app/world/domain/models/world.model';

import { EngineStorage, StoredClock } from './engine-host.model';

import {
  EngineCommandPayloads,
  EngineErrorCode,
  ImportedPlayer,
  ProgressPayload,
} from '../service/engine-service.model';

/** What an import needs of the host (TS §10.3). */
export interface PlayerImportPorts {
  storage: EngineStorage;
  locks?: PlayerLocks;
  now(): number;
  /** Runs between two slices of the history run. */
  yieldToEvents(): Promise<void>;
  /** Computing time of one slice. */
  sliceMs: number;
  /** Interval of the `progress` events. */
  progressIntervalMs: number;
  progress(payload: ProgressPayload): void;
  createWorld(seedKey: SeedKey): World;
  prices?: PricePortFactory;
}

export type PlayerImportResult =
  { ok: true; player: ImportedPlayer } | { ok: false; error: EngineErrorCode; message?: string };

class ImportFailure extends Error {
  readonly code: EngineErrorCode;

  constructor(code: EngineErrorCode, message: string = code) {
    super(message);
    this.code = code;
  }
}

/**
 * Imports an export file as a new player (TS §10.3): decode and check it (`IMPORT_ERRORS`), take the
 * player's Web Lock, recompute the market history from the epoch to the export day in slices
 * (month starts, checksum comparison), restore the engine from the exported state (a failure is
 * `invalid-structure`), and write snapshot, month starts, paused clock and journal in one
 * transaction. Nothing stays in the database when it fails. The UI creates the profile afterwards.
 */
export async function importPlayer(
  payload: EngineCommandPayloads['importPlayer'],
  ports: PlayerImportPorts,
): Promise<PlayerImportResult> {
  const decoded = await decodePlayerExport(payload.content);
  if (!decoded.ok) {
    return { ok: false, error: decoded.error };
  }
  const { playerId } = payload;
  const lock: PlayerLock | null = (await ports.locks?.acquire(playerId)) ?? null;
  if (ports.locks !== undefined && lock === null) {
    return { ok: false, error: 'player-locked' };
  }
  let started = false;
  try {
    const stored = await storageCall(() => ports.storage.loadPlayerState(playerId));
    if (stored.snapshot !== undefined || stored.clock !== undefined) {
      throw new ImportFailure('invalid-command', `player ${playerId} exists`);
    }
    started = true;
    const player = await importGame(decoded.export, playerId, ports);
    return { ok: true, player };
  } catch (error) {
    if (started) {
      ports.progress({ kind: 'import', state: 'cancelled', done: 0, total: 1 });
    }
    return error instanceof ImportFailure
      ? { ok: false, error: error.code, message: error.message }
      : { ok: false, error: 'internal-error', message: errorMessage(error) };
  } finally {
    lock?.release();
  }
}

async function importGame(
  exported: PlayerExport,
  playerId: string,
  ports: PlayerImportPorts,
): Promise<ImportedPlayer> {
  const world = structureCall(() => {
    const seedKey = deriveSeedKey(exported.player.seed);
    return createGameWorld(seedKey, ports.createWorld(seedKey));
  });
  const run = await historyRun(world, exported.market.day, ports);
  const imported = structureCall(() => importedGame(world.context, exported, run));
  const { engine, worth } = structureCall(() => {
    const restored = GameEngine.restore(world, imported.snapshot, {
      monthStarts: imported.monthStarts,
      ...(ports.prices === undefined ? {} : { prices: ports.prices }),
    });
    // Valuing every account and position reads the restored state the way the game will.
    accountViews(restored.player);
    return { engine: restored, worth: netWorth(restored.player, restored.securitiesValue()) };
  });
  const state = engine.snapshot();
  const clock: StoredClock = {
    tick: state.tick,
    speed: exported.clock.speed,
    paused: true,
    lastSeenAt: ports.now(),
    netWorth: worth,
  };
  try {
    await ports.storage.saveSnapshot(playerId, state, {
      monthStarts: imported.monthStarts,
      clock,
      transactions: exported.transactions,
      notifications: exported.notifications,
      keepNotificationsFrom: oldestKeptSeq(state.player.notifications.nextSeq - 1),
      dailyPoints: exported.series.performance,
    });
  } catch (error) {
    // The snapshot is written in one transaction; this removes anything a broken storage kept.
    await ports.storage.deletePlayer(playerId).catch(() => undefined);
    throw new ImportFailure('storage-failed', errorMessage(error));
  }
  ports.progress({ kind: 'import', state: 'done', done: run.total, total: run.total });
  return {
    playerId,
    name: exported.player.name,
    seed: exported.player.seed,
    startConditions: { ...exported.player.startConditions },
    simVersion: SIM_VERSION,
    schemaVersion: SCHEMA_VERSION,
    appVersion: exported.appVersion,
    exportedAt: exported.exportedAt,
    tick: state.tick,
    netWorth: worth,
    marketChecksumMatches: imported.marketChecksumMatches,
  };
}

/** The history run in slices of `sliceMs`, with `progress` about every `progressIntervalMs`. */
async function historyRun(
  world: GameWorld,
  toDay: number,
  ports: PlayerImportPorts,
): Promise<MarketHistoryRun> {
  const run = new MarketHistoryRun(world.context, toDay);
  let progressMs = ports.now();
  ports.progress({ kind: 'import', state: 'running', done: 0, total: run.total });
  for (;;) {
    const sliceStart = ports.now();
    if (run.run(() => ports.now() - sliceStart >= ports.sliceMs)) {
      return run;
    }
    const now = ports.now();
    if (now - progressMs >= ports.progressIntervalMs) {
      progressMs = now;
      ports.progress({ kind: 'import', state: 'running', done: run.done, total: run.total });
    }
    await ports.yieldToEvents();
  }
}

/** Runs work on the file's content; an exception means the content does not fit the engine. */
function structureCall<T>(work: () => T): T {
  try {
    return work();
  } catch (error) {
    throw new ImportFailure('invalid-structure', errorMessage(error));
  }
}

async function storageCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw new ImportFailure('storage-failed', errorMessage(error));
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
