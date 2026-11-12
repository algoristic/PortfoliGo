import { dayIndex } from '@app/clock/domain/calendar-logic';
import { Tick, TICKS_PER_DAY, TradingHours } from '@app/clock/domain/models/time.model';
import { catchUpSeenAt, catchUpTarget } from '@app/engine/domain/catch-up-logic';
import { ClockPacer } from '@app/engine/domain/clock-pacing-logic';
import { GameEngine } from '@app/engine/domain/game-engine';
import { createGameWorld } from '@app/engine/domain/game-world';
import { jumpTargetTick } from '@app/engine/domain/jump-target-logic';
import { ClockSettings } from '@app/engine/domain/models/engine-clock.model';
import { GameCommand } from '@app/engine/domain/models/engine-command.model';
import { replayCommands } from '@app/engine/domain/replay';
import { seriesQuote } from '@app/engine/domain/series-quote';
import { Throttle } from '@app/engine/domain/throttle-logic';
import { SCHEMA_VERSION, SIM_VERSION } from '@app/engine/domain/version';
import { seriesCount } from '@app/market/domain/series';
import { PlayerLock } from '@app/persistence/data-access/locks/player-locks';
import { deriveSeedKey } from '@app/simulation/util/seed';
import { generateWorld } from '@app/world/domain/world-generator';

import { CandleBackfill } from './candle-backfill';
import { DailyCandleSource } from './daily-candle-source';
import {
  DailyCandlePatch,
  DEFAULT_ENGINE_HOST_CONFIG,
  EngineHostConfig,
  EngineHostOptions,
  EngineHostPorts,
  GeneratedWorld,
  StoredClock,
  StoredPlayerState,
} from './engine-host.model';

import {
  ClockPayload,
  ENGINE_COMMAND_TYPES,
  ENGINE_PROTOCOL,
  EngineCommandMessage,
  EngineCommandPayloads,
  EngineErrorCode,
  EngineEventMessage,
  EngineEventPayloads,
  EngineReplies,
  ExchangeInfo,
  LoadPlayerPayload,
  ProgressKind,
  ProgressPayload,
  ReplyPayload,
} from '../service/engine-service.model';
import {
  isEngineCommandMessage,
  isEngineEnvelope,
  messageId,
} from '../service/engine-service.utils';

/** A failed command with its code; the host answers it with an error reply. */
class CommandFailure extends Error {
  readonly code: EngineErrorCode;

  constructor(code: EngineErrorCode, message: string = code) {
    super(message);
    this.code = code;
  }
}

/** A run in batch mode (TS §3.7): a jump or the catch-up after loading. */
interface BatchRun {
  kind: Extract<ProgressKind, 'jump' | 'catch-up'>;
  from: Tick;
  to: Tick;
  lastProgressMs: number;
}

interface LoadedGame {
  playerId: string;
  engine: GameEngine;
  pacer: ClockPacer;
  sessions: readonly TradingHours[];
  overloaded: boolean;
  batch?: BatchRun;
  lock: PlayerLock | null;
  candles: DailyCandleSource;
  /** Daily candles waiting to be written; one write at a time. */
  pendingCandles: DailyCandlePatch[];
  candleWrite?: Promise<void>;
  backfill?: CandleBackfill;
  backfillPlanned: boolean;
  backfillRunning: boolean;
  backfillProgressMs: number;
  /** Day of the newest month start entry in the database. */
  savedMonthDay: number;
  /** Last (attempted) writes of the clock state and of a snapshot. */
  clockSavedMs: number;
  clockSavedTick: Tick;
  snapshotMs: number;
  snapshotTick: Tick;
  /** A game command was applied since the last snapshot. */
  changedSinceSnapshot: boolean;
}

type Handlers = {
  [K in EngineCommandMessage['type']]: (
    payload: EngineCommandPayloads[K],
    id: string,
  ) => EngineReplies[K] | Promise<EngineReplies[K]>;
};

/** Standard world of a seed (TS §5.1). */
export function generateStandardWorld(seed: string): GeneratedWorld {
  const seedKey = deriveSeedKey(seed);
  return { seedKey, world: generateWorld(seedKey) };
}

/**
 * Worker host of the engine (TS §8.1): message handling, clock (TS §3.5, §3.6), jumps (TS §3.7),
 * subscriptions and throttling (TS §8.4). Framework-free and without a global clock: wall clock,
 * loop timer, `postMessage` and storage are ports, so tests drive it in the test process.
 *
 * Messages are handled one after another. A game command holds the clock while it is written
 * ahead; clock commands, queries and subscriptions don't (E-08).
 */
export class EngineHost {
  readonly #ports: EngineHostPorts;
  readonly #options: EngineHostOptions;
  readonly #config: EngineHostConfig;
  readonly #clockThrottle: Throttle;
  readonly #quotesThrottle: Throttle;
  readonly #subscriptions = new Set<number>();
  readonly #handlers: Handlers = {
    loadPlayer: (payload) => this.#load(payload),
    unloadPlayer: () => this.#unload(),
    setSpeed: ({ speed }) => this.#changeClock({ speed }),
    pause: () => this.#changeClock({ paused: true }),
    resume: () => this.#changeClock({ paused: false }),
    setVisibility: ({ visible }) => this.#setVisibility(visible),
    jumpTo: ({ target }) => {
      const game = this.#requireIdle();
      const to = jumpTargetTick(target, game.engine.tick, game.sessions);
      if (to === null) {
        throw new CommandFailure('invalid-jump-target');
      }
      this.#startBatch(game, 'jump', to);
      return { targetTick: to };
    },
    cancelJump: () => {
      const game = this.#game;
      if (game?.batch?.kind === 'jump') {
        this.#endBatch(game, 'cancelled');
      }
      return null;
    },
    subscribe: ({ series }) => {
      series.forEach((s) => this.#subscriptions.add(s));
      this.#quotesStale = true;
      return null;
    },
    unsubscribe: ({ series }) => {
      series.forEach((s) => this.#subscriptions.delete(s));
      return null;
    },
    query: () => ({ kind: 'exchanges', exchanges: this.#exchanges(this.#requireGame()) }),
    setBackgroundMode: ({ mode }, id) =>
      this.#applyGameCommand((tick) => ({ id, tick, type: 'setBackgroundMode', mode })),
  };

  #queue: Promise<void> = Promise.resolve();
  /** Writes that run beside the loop (clock, snapshots, candles); they never reject. */
  readonly #writes = new Set<Promise<void>>();
  #storageFailing = false;
  #game?: LoadedGame;
  #visible = true;
  /** Game commands in progress; the clock holds while it is > 0. */
  #held = 0;
  #timerHandle: unknown;
  #timerActive = false;
  #failed = false;
  #nextId = 1;
  #lastClock: ClockPayload | null = null;
  #lastQuotesTick: number | null = null;
  #quotesStale = false;

  constructor(ports: EngineHostPorts, options: EngineHostOptions = {}) {
    this.#ports = ports;
    this.#options = options;
    this.#config = { ...DEFAULT_ENGINE_HOST_CONFIG, ...options.config };
    this.#clockThrottle = new Throttle(this.#config.clockPerSecond);
    this.#quotesThrottle = new Throttle(this.#config.quotesPerSecond);
  }

  /** Handles a message of the UI; resolves when it is answered. Never rejects. */
  receive(data: unknown): Promise<void> {
    this.#queue = this.#queue.then(() => this.#handle(data));
    return this.#queue;
  }

  /** Resolves when the writes started so far (clock, snapshots, candles) have settled. */
  settled(): Promise<void> {
    return this.#settleWrites();
  }

  /**
   * Stops the loop and releases the lock without saving, e.g. when the worker is terminated. Writes
   * already started may still complete.
   */
  dispose(): void {
    this.#stopLoop();
    this.#game?.lock?.release();
    this.#game = undefined;
  }

  async #handle(data: unknown): Promise<void> {
    if (!isEngineCommandMessage(data)) {
      const id = messageId(data);
      if (id !== null) {
        const known =
          isEngineEnvelope(data) && (ENGINE_COMMAND_TYPES as readonly string[]).includes(data.type);
        this.#reply(id, { ok: false, error: known ? 'invalid-command' : 'invalid-message' });
      }
      return;
    }
    if (this.#failed) {
      this.#reply(data.id, { ok: false, error: 'internal-error', message: 'engine failed' });
      return;
    }
    let reply: ReplyPayload;
    try {
      const handler = this.#handlers[data.type] as (
        payload: unknown,
        id: string,
      ) => unknown | Promise<unknown>;
      reply = { ok: true, data: await handler(data.payload, data.id) };
    } catch (error) {
      reply =
        error instanceof CommandFailure
          ? { ok: false, error: error.code, message: error.message }
          : { ok: false, error: 'internal-error', message: errorMessage(error) };
    }
    // The clock goes out before the reply, so the UI sees the new state when the command ends.
    this.#guarded(() => this.#flush());
    this.#reply(data.id, reply);
  }

  /**
   * Loads a player (TS §9.2): lock, read the stored state, create the world, restore the snapshot
   * (or start a new game), discard the journal after the snapshot tick, replay the logged commands,
   * write a snapshot, then catch up in the loop (TS §3.7).
   */
  async #load(payload: LoadPlayerPayload): Promise<EngineReplies['loadPlayer']> {
    if (this.#game !== undefined) {
      await this.#unload().catch((error: unknown) => this.#storageFailed(error));
    }
    const lock = (await this.#ports.locks?.acquire(payload.playerId)) ?? null;
    if (this.#ports.locks !== undefined && lock === null) {
      throw new CommandFailure('player-locked');
    }
    try {
      return await this.#open(payload, lock);
    } catch (error) {
      if (this.#game?.lock === lock) {
        this.#stopLoop();
        this.#game = undefined;
      }
      lock?.release();
      throw error;
    }
  }

  async #open(
    payload: LoadPlayerPayload,
    lock: PlayerLock | null,
  ): Promise<EngineReplies['loadPlayer']> {
    const { storage } = this.#ports;
    this.#progress({ kind: 'init', state: 'running', done: 0, total: 1 });
    const stored = await storageCall(() => storage.loadPlayerState(payload.playerId));
    const snapshot = stored.snapshot;
    if (
      snapshot !== undefined &&
      (snapshot.schemaVersion !== SCHEMA_VERSION || snapshot.simVersion !== SIM_VERSION)
    ) {
      throw new CommandFailure('player-outdated');
    }
    const generated = (this.#options.createWorld ?? generateStandardWorld)(payload.seed);
    const world = createGameWorld(generated.seedKey, generated.world);
    const candles = new DailyCandleSource(world, this.#options.prices);
    const engine =
      snapshot === undefined
        ? GameEngine.start(world, payload.start, { prices: candles.prices })
        : GameEngine.restore(world, snapshot.state, {
            monthStarts: stored.monthStarts,
            prices: candles.prices,
          });
    if (snapshot !== undefined) {
      await storageCall(() => storage.discardAfter(payload.playerId, snapshot.tick));
    }
    const now = this.#ports.now();
    const settings: ClockSettings = {
      speed: stored.clock?.speed ?? this.#options.initialSpeed ?? '1min',
      paused: stored.clock?.paused ?? true,
      visible: this.#visible,
      backgroundMode: engine.player.backgroundMode,
    };
    const game: LoadedGame = {
      playerId: payload.playerId,
      engine,
      pacer: new ClockPacer(settings, engine.tick, now),
      sessions: world.exchanges.map(({ open, close }) => ({ open, close })),
      overloaded: false,
      lock,
      candles,
      pendingCandles: [],
      backfill: this.#createBackfill(payload.playerId, candles),
      backfillPlanned: false,
      backfillRunning: false,
      backfillProgressMs: now,
      savedMonthDay: stored.monthStarts.at(-1)?.day ?? -1,
      clockSavedMs: now,
      clockSavedTick: engine.tick,
      snapshotMs: now,
      snapshotTick: engine.tick,
      changedSinceSnapshot: false,
    };
    this.#game = game;
    this.#drainEngineEvents(game, false);
    this.#replay(game, stored, payload.minTick);
    game.pacer.update(
      { backgroundMode: engine.player.backgroundMode },
      engine.tick,
      this.#ports.now(),
    );
    // The first snapshot of a new player, or the replayed state: the next restore starts here.
    const written = this.#snapshotData(game);
    await storageCall(() => storage.saveSnapshot(game.playerId, written.state, written.options));
    this.#snapshotWritten(game, written.monthDay);
    this.#progress({ kind: 'init', state: 'done', done: 1, total: 1 });

    const target =
      stored.clock === undefined
        ? engine.tick
        : catchUpTarget(
            { tick: engine.tick, paused: stored.clock.paused, lastSeenAt: stored.clock.lastSeenAt },
            engine.player.backgroundMode,
            this.#ports.now(),
          );
    this.#lastClock = null;
    this.#quotesStale = true;
    if (target > engine.tick) {
      this.#startBatch(game, 'catch-up', target);
    } else {
      this.#startBackfill(game);
      this.#restartLoop(this.#config.loopIntervalMs);
    }
    return { playerId: game.playerId, tick: engine.tick };
  }

  /**
   * Restore step 3 (TS §9.2): replays the logged commands and runs on to the newest of the stored
   * clock, the last command and the lower bound of the UI, in batch mode.
   */
  #replay(game: LoadedGame, stored: StoredPlayerState, minTick: Tick | undefined): void {
    const lastCommand = stored.commands.at(-1);
    const target = Math.max(
      game.engine.tick,
      stored.clock?.tick ?? -Infinity,
      lastCommand?.tick ?? -Infinity,
      minTick ?? -Infinity,
    );
    game.candles.batch = true;
    try {
      replayCommands(game.engine, stored.commands, target);
      this.#drainEngineEvents(game, true);
    } finally {
      game.candles.batch = false;
    }
  }

  /** Saves the game (snapshot with clock and candles) and releases the lock (TS §8.2). */
  async #unload(): Promise<null> {
    const game = this.#game;
    if (game === undefined) {
      return null;
    }
    this.#stopLoop();
    // Before the batch run ends: during a catch-up, the clock keeps the ticks still to catch up.
    const written = this.#snapshotData(game);
    if (game.batch !== undefined) {
      this.#endBatch(game, 'cancelled', false);
    }
    this.#game = undefined;
    try {
      await this.#settleWrites();
      this.#writeCandles(game);
      await this.#settleWrites();
      await storageCall(() =>
        this.#ports.storage.saveSnapshot(game.playerId, written.state, written.options),
      );
    } finally {
      game.lock?.release();
    }
    return null;
  }

  async #changeClock(change: Partial<ClockSettings>): Promise<null> {
    const game = this.#requireIdle();
    game.pacer.update(change, game.engine.tick, this.#ports.now());
    await this.#saveClock(game);
    return null;
  }

  /** Hidden (TS §3.6, `hidden` and `pagehide`): store the clock with a snapshot. */
  async #setVisibility(visible: boolean): Promise<null> {
    this.#visible = visible;
    const game = this.#game;
    if (game !== undefined) {
      game.pacer.update({ visible }, game.engine.tick, this.#ports.now());
      if (!visible) {
        await this.#snapshot(game);
      }
    }
    return null;
  }

  /**
   * Accepts a game command (TS §8.5): hold the clock, stamp the command with the current tick,
   * write it ahead, apply it, answer, and go on with a new anchor.
   */
  async #applyGameCommand(build: (tick: number) => GameCommand): Promise<{ tick: number }> {
    const game = this.#requireIdle();
    this.#held++;
    try {
      const command = build(game.engine.tick);
      try {
        await this.#ports.storage.appendCommand(game.playerId, command, this.#storedClock(game));
      } catch (error) {
        throw new CommandFailure('storage-failed', errorMessage(error));
      }
      const result = game.engine.applyCommand(command);
      game.changedSinceSnapshot = true;
      game.clockSavedMs = this.#ports.now();
      game.clockSavedTick = command.tick;
      this.#drainEngineEvents(game, false);
      if (!result.ok) {
        throw new CommandFailure(result.error);
      }
      game.pacer.update(
        { backgroundMode: game.engine.player.backgroundMode },
        game.engine.tick,
        this.#ports.now(),
      );
      return { tick: command.tick };
    } finally {
      this.#held--;
      game.pacer.reanchor(game.engine.tick, this.#ports.now());
    }
  }

  #requireGame(): LoadedGame {
    if (this.#game === undefined) {
      throw new CommandFailure('player-not-loaded');
    }
    return this.#game;
  }

  #requireIdle(): LoadedGame {
    const game = this.#requireGame();
    if (game.batch !== undefined) {
      throw new CommandFailure('busy');
    }
    return game;
  }

  #restartLoop(delayMs: number): void {
    this.#stopLoop();
    this.#schedule(delayMs);
  }

  #schedule(delayMs: number): void {
    if (this.#timerActive) {
      return;
    }
    this.#timerActive = true;
    this.#timerHandle = this.#ports.timer.set(() => {
      this.#timerActive = false;
      this.#pass();
    }, delayMs);
  }

  #stopLoop(): void {
    if (this.#timerActive) {
      this.#ports.timer.clear(this.#timerHandle);
      this.#timerActive = false;
    }
  }

  /**
   * One pass of the loop (TS §3.5): a batch run or the live clock within the time budget, then the
   * periodic writes, the candle job in the rest of the budget, and what is due to the UI.
   */
  #pass(): void {
    const game = this.#game;
    if (game === undefined || this.#failed) {
      return;
    }
    this.#guarded(() => {
      if (this.#held === 0) {
        const start = this.#ports.now();
        const shouldYield = (): boolean => this.#ports.now() - start >= this.#config.passBudgetMs;
        if (game.batch !== undefined) {
          this.#batchPass(game, game.batch, shouldYield);
        } else {
          const result = game.pacer.pass(game.engine, start, shouldYield);
          game.overloaded = result.overloaded;
          this.#drainEngineEvents(game, false);
          this.#periodicWrites(game);
          if (result.reached && !shouldYield()) {
            this.#backfillPass(game, shouldYield);
          }
        }
      }
      this.#writeCandles(game);
      this.#flush();
      this.#schedule(game.batch !== undefined ? 0 : this.#config.loopIntervalMs);
    });
  }

  /** Runs loop work; an exception there is not recoverable and ends the engine with `fatal`. */
  #guarded(work: () => void): void {
    if (this.#failed) {
      return;
    }
    try {
      work();
    } catch (error) {
      this.#failed = true;
      this.#stopLoop();
      this.#post('fatal', { message: errorMessage(error) });
    }
  }

  #startBatch(game: LoadedGame, kind: BatchRun['kind'], to: Tick): void {
    const from = game.engine.tick;
    game.batch = { kind, from, to, lastProgressMs: this.#ports.now() };
    this.#progress({ kind, state: 'running', done: 0, total: to - from });
    this.#restartLoop(0);
  }

  /** Batch mode (TS §3.7): runs to the target; progress about every 100 ms. */
  #batchPass(game: LoadedGame, batch: BatchRun, shouldYield: () => boolean): void {
    game.candles.batch = true;
    let reached: boolean;
    try {
      reached = game.engine.runUntil(batch.to, shouldYield);
      this.#drainEngineEvents(game, true);
    } finally {
      game.candles.batch = false;
    }
    if (reached) {
      this.#endBatch(game, 'done');
      return;
    }
    const now = this.#ports.now();
    if (now - batch.lastProgressMs >= this.#config.progressIntervalMs) {
      batch.lastProgressMs = now;
      this.#progress({
        kind: batch.kind,
        state: 'running',
        done: game.engine.tick - batch.from,
        total: batch.to - batch.from,
      });
    }
  }

  /** Ends a batch run; the clock goes on from a new anchor, and a snapshot follows (TS §9.2). */
  #endBatch(game: LoadedGame, state: 'done' | 'cancelled', snapshot = true): void {
    const batch = game.batch;
    if (batch === undefined) {
      return;
    }
    game.batch = undefined;
    game.pacer.reanchor(game.engine.tick, this.#ports.now());
    this.#progress({
      kind: batch.kind,
      state,
      done: game.engine.tick - batch.from,
      total: batch.to - batch.from,
    });
    if (snapshot) {
      void this.#snapshot(game);
      this.#startBackfill(game);
    }
  }

  /**
   * Engine events of the last steps. M2 forwards none of them to the UI; notifications and the
   * absence report follow in M3. `session-closed` writes the daily candles (TS §6.8): live with
   * high and low, in batch mode open and close only, and the background job adds the rest.
   */
  #drainEngineEvents(game: LoadedGame, batch: boolean): void {
    for (const event of game.engine.drainEvents()) {
      if (event.type === 'session-closed') {
        const closed = game.candles.closed(event.series, event.day, game.engine.tick, !batch);
        game.pendingCandles.push(...closed.patches);
        if (!closed.complete) {
          game.backfill?.addHighLowDays([event.day]);
        }
      }
    }
  }

  /**
   * Periodic writes of the live clock (TS §9.2): a snapshot every 30 s, else the clock state every
   * 5 s and as soon as a game day passed since the last one. Nothing is written while the state
   * stands still (paused or resting), apart from the clock writes of the commands.
   */
  #periodicWrites(game: LoadedGame): void {
    const now = this.#ports.now();
    const tick = game.engine.tick;
    const changed = tick !== game.snapshotTick || game.changedSinceSnapshot;
    if (changed && now - game.snapshotMs >= this.#config.snapshotIntervalMs) {
      void this.#snapshot(game);
      return;
    }
    if (
      tick !== game.clockSavedTick &&
      (now - game.clockSavedMs >= this.#config.clockSaveIntervalMs ||
        tick - game.clockSavedTick >= TICKS_PER_DAY)
    ) {
      void this.#saveClock(game);
    }
  }

  #saveClock(game: LoadedGame): Promise<void> {
    const clock = this.#storedClock(game);
    game.clockSavedMs = this.#ports.now();
    game.clockSavedTick = clock.tick;
    return this.#write(() => this.#ports.storage.saveClock(game.playerId, clock));
  }

  /** Snapshot with the new month starts and the clock in one transaction (TS §9.2). */
  #snapshot(game: LoadedGame): Promise<void> {
    const written = this.#snapshotData(game);
    return this.#write(
      () => this.#ports.storage.saveSnapshot(game.playerId, written.state, written.options),
      () => this.#snapshotWritten(game, written.monthDay),
    );
  }

  /**
   * What a snapshot writes. Events still in the engine's buffer are handled first, because a
   * restore does not bring them back (`GameEngine.restore`).
   */
  #snapshotData(game: LoadedGame): {
    state: ReturnType<GameEngine['snapshot']>;
    options: { monthStarts: ReturnType<GameEngine['monthStartsAfter']>; clock: StoredClock };
    monthDay: number;
  } {
    this.#drainEngineEvents(game, game.batch !== undefined);
    const state = game.engine.snapshot();
    const monthStarts = game.engine.monthStartsAfter(game.savedMonthDay);
    const clock = this.#storedClock(game);
    const now = this.#ports.now();
    game.snapshotMs = now;
    game.snapshotTick = state.tick;
    game.changedSinceSnapshot = false;
    game.clockSavedMs = now;
    game.clockSavedTick = clock.tick;
    return {
      state,
      options: { monthStarts, clock },
      monthDay: monthStarts.at(-1)?.day ?? game.savedMonthDay,
    };
  }

  #snapshotWritten(game: LoadedGame, monthDay: number): void {
    game.savedMonthDay = Math.max(game.savedMonthDay, monthDay);
  }

  /**
   * Writes the waiting daily candles in one transaction, one write at a time; what came in meanwhile
   * follows right after.
   */
  #writeCandles(game: LoadedGame): void {
    if (game.pendingCandles.length === 0 || game.candleWrite !== undefined) {
      return;
    }
    const patches = game.pendingCandles.splice(0);
    game.candleWrite = this.#write(
      () => this.#ports.storage.saveDailyCandles(game.playerId, patches),
      undefined,
      () => {
        game.candleWrite = undefined;
        if (this.#game === game) {
          this.#writeCandles(game);
        }
      },
    );
  }

  #createBackfill(playerId: string, candles: DailyCandleSource): CandleBackfill | undefined {
    const from =
      this.#options.candleBackfillFrom === undefined ? 0 : this.#options.candleBackfillFrom;
    return from === null
      ? undefined
      : new CandleBackfill(candles, this.#ports.storage, playerId, dayIndex(from));
  }

  /**
   * Plans the candle job once per load, after the catch-up: it reads what the stored candles miss
   * up to the current day, after the candle writes so far have settled.
   */
  #startBackfill(game: LoadedGame): void {
    const backfill = game.backfill;
    if (backfill === undefined || game.backfillPlanned) {
      return;
    }
    game.backfillPlanned = true;
    const toDay = dayIndex(game.engine.tick);
    this.#writeCandles(game);
    const planned = this.#settleWrites()
      .then(() => backfill.plan(toDay))
      .catch((error: unknown) => this.#storageFailed(error));
    this.#track(planned);
  }

  /**
   * The candle job in the rest of the pass budget, only when the clock reached its target: it never
   * holds back game time, at most it delays the next pass by one unit of work (TS §6.8).
   */
  #backfillPass(game: LoadedGame, shouldYield: () => boolean): void {
    const backfill = game.backfill;
    if (backfill === undefined) {
      return;
    }
    const report = (state: 'running' | 'done'): void => {
      game.backfillProgressMs = this.#ports.now();
      this.#progress({ kind: 'candles', state, done: backfill.done, total: backfill.total });
    };
    const beforeDay = dayIndex(game.engine.tick);
    if (!backfill.hasWork(beforeDay)) {
      if (game.backfillRunning) {
        game.backfillRunning = false;
        report('done');
      }
      return;
    }
    if (!game.backfillRunning) {
      game.backfillRunning = true;
      report('running');
    }
    backfill.run(beforeDay, shouldYield, (patches) => game.pendingCandles.push(...patches));
    if (!backfill.hasWork(beforeDay)) {
      game.backfillRunning = false;
      report('done');
    } else if (this.#ports.now() - game.backfillProgressMs >= this.#config.progressIntervalMs) {
      report('running');
    }
  }

  /** Sends the clock and the quotes when they changed and their rate limit allows it. */
  #flush(): void {
    const game = this.#game;
    if (game === undefined) {
      return;
    }
    const now = this.#ports.now();
    const clock = this.#clockPayload(game);
    if (!sameClock(clock, this.#lastClock) && this.#clockThrottle.isDue(now)) {
      this.#post('clock', clock);
      this.#clockThrottle.sent(now);
      this.#lastClock = clock;
    }
    const tick = game.engine.tick;
    if (
      this.#subscriptions.size > 0 &&
      (this.#quotesStale || tick !== this.#lastQuotesTick) &&
      this.#quotesThrottle.isDue(now)
    ) {
      const { context } = game.engine.world;
      const count = seriesCount(context);
      const series = [...this.#subscriptions].filter((s) => s < count).sort((a, b) => a - b);
      const quotes = series.map((s) => seriesQuote(context, game.engine.prices, s, tick));
      this.#post('quotes', { tick, quotes });
      this.#quotesThrottle.sent(now);
      this.#lastQuotesTick = tick;
      this.#quotesStale = false;
    }
  }

  #clockPayload(game: LoadedGame): ClockPayload {
    const { settings } = game.pacer;
    const jumping = game.batch !== undefined;
    return {
      tick: game.engine.tick,
      speed: settings.speed,
      paused: settings.paused,
      visible: this.#visible,
      backgroundMode: settings.backgroundMode,
      effectiveSpeed: jumping ? null : game.pacer.speed,
      overloaded: !jumping && game.overloaded,
      jumping,
    };
  }

  /**
   * Clock state to store. During a catch-up, `lastSeenAt` lies back by the ticks still to catch up,
   * so a restore from it loses none of them (`catchUpSeenAt`).
   */
  #storedClock(game: LoadedGame): StoredClock {
    const { speed, paused } = game.pacer.settings;
    const tick = game.engine.tick;
    const now = this.#ports.now();
    const lastSeenAt =
      game.batch?.kind === 'catch-up' ? catchUpSeenAt(now, tick, game.batch.to) : now;
    return { tick, speed, paused, lastSeenAt };
  }

  /**
   * A write beside the loop. A failure does not stop the game: the next periodic write tries again,
   * and the UI gets one `warning` per series of failures (TS §9.5).
   */
  #write(work: () => Promise<void>, onSuccess?: () => void, onSettled?: () => void): Promise<void> {
    let started: Promise<void>;
    try {
      started = work();
    } catch (error) {
      started = Promise.reject(error);
    }
    const written = started
      .then(
        () => {
          this.#storageFailing = false;
          onSuccess?.();
        },
        (error: unknown) => this.#storageFailed(error),
      )
      .finally(() => onSettled?.());
    this.#track(written);
    return written;
  }

  #track(write: Promise<void>): void {
    this.#writes.add(write);
    void write.finally(() => this.#writes.delete(write));
  }

  async #settleWrites(): Promise<void> {
    while (this.#writes.size > 0) {
      await Promise.allSettled([...this.#writes]);
    }
  }

  #storageFailed(error: unknown): void {
    if (!this.#storageFailing) {
      this.#storageFailing = true;
      this.#post('warning', { code: 'storage-failed', message: errorMessage(error) });
    }
  }

  #exchanges(game: LoadedGame): ExchangeInfo[] {
    const { world } = game.engine.world;
    return world.exchanges.map((exchange) => {
      const country = world.countries.find((candidate) => candidate.id === exchange.countryId);
      if (country === undefined) {
        throw new Error(`EngineHost: unknown country ${exchange.countryId}`);
      }
      const { id, name, open, close } = exchange;
      return { id, name, regionId: country.regionId, open, close };
    });
  }

  #progress(payload: ProgressPayload): void {
    this.#post('progress', payload);
  }

  #reply(replyTo: string, payload: EngineEventPayloads['reply']): void {
    this.#post('reply', payload, replyTo);
  }

  #post<K extends EngineEventMessage['type']>(
    type: K,
    payload: EngineEventPayloads[K],
    replyTo?: string,
  ): void {
    const message = {
      protocol: ENGINE_PROTOCOL,
      id: `w${this.#nextId++}`,
      ...(replyTo === undefined ? {} : { replyTo }),
      type,
      payload,
    } as EngineEventMessage;
    this.#ports.post(message);
  }
}

function sameClock(a: ClockPayload, b: ClockPayload | null): boolean {
  return (
    b !== null &&
    a.tick === b.tick &&
    a.speed === b.speed &&
    a.paused === b.paused &&
    a.visible === b.visible &&
    a.backgroundMode === b.backgroundMode &&
    a.effectiveSpeed === b.effectiveSpeed &&
    a.overloaded === b.overloaded &&
    a.jumping === b.jumping
  );
}

/** Runs a storage call of a command; its failure answers the command with `storage-failed`. */
async function storageCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw new CommandFailure('storage-failed', errorMessage(error));
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
