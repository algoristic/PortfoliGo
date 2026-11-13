import { monthOf } from '@app/banking/domain/bank-run-logic';
import { AccountId } from '@app/banking/domain/models/account.model';
import { Transaction } from '@app/banking/domain/models/ledger.model';
import { mergeJournal, statementPage } from '@app/banking/domain/statement-logic';
import { dayIndex } from '@app/clock/domain/calendar-logic';
import { Tick, TICKS_PER_DAY, TradingHours } from '@app/clock/domain/models/time.model';
import { accountViews, netWorth } from '@app/engine/domain/account-projection';
import { liveHighLow, WorkShare } from '@app/engine/domain/background-share-logic';
import { catchUpSeenAt, catchUpTarget } from '@app/engine/domain/catch-up-logic';
import { ClockPacer } from '@app/engine/domain/clock-pacing-logic';
import { GameEngine } from '@app/engine/domain/game-engine';
import { createGameWorld } from '@app/engine/domain/game-world';
import { jumpTargetTick } from '@app/engine/domain/jump-target-logic';
import { marketMovers, screenInstruments } from '@app/engine/domain/market-screen';
import { ClockSettings } from '@app/engine/domain/models/engine-clock.model';
import { GameCommand, OpenedAccount } from '@app/engine/domain/models/engine-command.model';
import { replayCommands } from '@app/engine/domain/replay';
import { seriesQuote } from '@app/engine/domain/series-quote';
import { Throttle } from '@app/engine/domain/throttle-logic';
import { SCHEMA_VERSION, SIM_VERSION } from '@app/engine/domain/version';
import { isIntraday, MAX_CANDLE_LIMIT } from '@app/market/domain/candle-window';
import {
  intradayCandleBlock,
  latestCandle,
  supportOpenClose,
} from '@app/market/domain/chart-candles';
import { DailyCloses } from '@app/market/domain/daily-closes';
import { instrumentCatalog, instrumentDetails } from '@app/market/domain/instrument-catalog';
import { Candle, CandleResolution } from '@app/market/domain/models/candle.model';
import { Instrument } from '@app/market/domain/models/instrument.model';
import { indexSeries, seriesCount } from '@app/market/domain/series';
import {
  closeAbsence,
  openAbsence,
  reportIndices,
  tallyBookings,
  tallyNotifications,
} from '@app/notifications/domain/absence-report-logic';
import {
  autoPauseApplies,
  autoPauseSettings,
  RunMode,
} from '@app/notifications/domain/auto-pause-logic';
import {
  AbsenceReport,
  AbsenceTally,
  IndexLevel,
} from '@app/notifications/domain/models/absence-report.model';
import {
  AutoPauseCode,
  GameNotification,
} from '@app/notifications/domain/models/notification.model';
import {
  mergeNotifications,
  notificationPage,
} from '@app/notifications/domain/notification-page-logic';
import { oldestKeptSeq, unreadCount } from '@app/notifications/domain/read-state-logic';
import { PlayerLock } from '@app/persistence/data-access/locks/player-locks';
import { deriveSeedKey } from '@app/simulation/util/seed';
import { generateWorld } from '@app/world/domain/world-generator';

import { CandleBackfill } from './candle-backfill';
import { dailyCandleBlock } from './daily-candle-query';
import { DailyCandleSource } from './daily-candle-source';
import { candleYear } from './daily-candles.utils';
import {
  DailyCandlePatch,
  DEFAULT_ENGINE_HOST_CONFIG,
  EngineHostConfig,
  EngineHostOptions,
  EngineHostPorts,
  GeneratedWorld,
  SaveSnapshotOptions,
  StoredClock,
  StoredPlayerState,
} from './engine-host.model';

import {
  AutoPauseCause,
  CandlesQuery,
  ChartSubscription,
  ClockPayload,
  ENGINE_COMMAND_TYPES,
  ENGINE_PROTOCOL,
  EngineCommandMessage,
  EngineCommandPayloads,
  EngineErrorCode,
  EngineEventMessage,
  EngineEventPayloads,
  EngineQuery,
  EngineQueryResult,
  EngineReplies,
  ExchangeInfo,
  LoadPlayerPayload,
  NotificationsProjection,
  NotificationsQuery,
  ProgressKind,
  ProgressPayload,
  ReplyPayload,
  ScreenerQuery,
  StatementQuery,
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
  /** Daily candles waiting to be written (TS §6.8, §9.2), and the calendar years they touch. */
  candleBuffer: DailyCandlePatch[];
  candleYears: Set<number>;
  candlesWrittenMs: number;
  /** One candle write at a time; a write asked for meanwhile follows right after. */
  candleWrite?: Promise<void>;
  /** The candles of the running write, until it settled (the candle query reads them too). */
  candlesWriting: DailyCandlePatch[];
  candleWriteAgain: boolean;
  backfill?: CandleBackfill;
  backfillPlanned: boolean;
  backfillRunning: boolean;
  backfillProgressMs: number;
  backfillShare: WorkShare;
  /**
   * Booked transactions not yet confirmed as stored, in journal order. Every write of transactions
   * and every snapshot writes all of them, so a stored snapshot never lacks one up to its tick.
   */
  unsavedTransactions: Transaction[];
  transactionsWrittenMs: number;
  transactionWriteRunning: boolean;
  /** Day of the newest month start entry in the database. */
  savedMonthDay: number;
  /** Last (attempted) writes of the clock state and of a snapshot. */
  clockSavedMs: number;
  clockSavedTick: Tick;
  snapshotMs: number;
  snapshotTick: Tick;
  /** A game command was applied since the last snapshot. */
  changedSinceSnapshot: boolean;
  /** Accounts changed since the last projection (TS §8.4), and whether the next one is full. */
  changedAccounts: Set<AccountId>;
  projectionFull: boolean;
  /** Notifications not yet confirmed as stored, like `unsavedTransactions` (TS §9.2). */
  unsavedNotifications: GameNotification[];
  notificationsWrittenMs: number;
  notificationWriteRunning: boolean;
  /** New notifications not yet sent to the UI (TS §8.3). */
  outgoingNotifications: GameNotification[];
  /** Counter, unread number and auto-pause settings of the last projection that carried them. */
  notificationsKey: string | null;
  /**
   * The watchlist of the last projection that carried it; the engine replaces the list on every
   * accepted `updateWatchlist`, so a new reference means a change.
   */
  watchlistSent: readonly string[] | null;
  /** Loading and replaying: notifications are stored, but neither sent nor reported. */
  replaying: boolean;
  /** Indices of the absence report (positions in the world's index list). */
  reportIndices: readonly number[];
  /** Absence running since a catch-up or since the app was hidden (US-BN-03). */
  absence?: AbsenceTally;
  /** Last absence report since loading, for the UI to fetch if it missed the event. */
  report: AbsenceReport | null;
  /** The notification whose auto-pause holds the game (TS §3.6), until `resume`. */
  autoPause?: AutoPauseCause;
  market?: MarketData;
}

/** Master data and the cache of daily closes for the market queries (AP 4.1), made on first use. */
interface MarketData {
  catalog: Instrument[];
  closes: DailyCloses;
}

/** A subscribed chart (TS §8.4) and the newest candle sent for it, `null` before the first. */
interface ChartState extends ChartSubscription {
  sent: Candle | null;
}

function chartKey(series: number, interval: CandleResolution): string {
  return `${series}/${interval}`;
}

function sameCandle(a: Candle, b: Candle): boolean {
  return (
    a.tick === b.tick &&
    a.open === b.open &&
    a.high === b.high &&
    a.low === b.low &&
    a.close === b.close
  );
}

/** What a snapshot writes, taken in one go (`#snapshotData`). */
interface SnapshotData {
  state: ReturnType<GameEngine['snapshot']>;
  options: Required<SaveSnapshotOptions>;
  monthDay: number;
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
  readonly #moversThrottle: Throttle;
  readonly #candleThrottle: Throttle;
  readonly #projectionThrottle: Throttle;
  readonly #notificationThrottle: Throttle;
  readonly #subscriptions = new Set<number>();
  /** Subscribed charts by `chartKey` (TS §8.4); several at once. */
  readonly #charts = new Map<string, ChartState>();
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
    subscribe: ({ series, movers, charts }) => {
      series.forEach((s) => this.#subscriptions.add(s));
      this.#quotesStale = true;
      if (movers === true) {
        this.#moversSubscribed = true;
        this.#moversStale = true;
      }
      // A chart subscribed (again) gets its newest candle with the next event.
      for (const { series: s, interval } of charts ?? []) {
        this.#charts.set(chartKey(s, interval), { series: s, interval, sent: null });
        this.#chartsStale = true;
      }
      return null;
    },
    unsubscribe: ({ series, movers, charts }) => {
      series.forEach((s) => this.#subscriptions.delete(s));
      if (movers === true) {
        this.#moversSubscribed = false;
      }
      for (const { series: s, interval } of charts ?? []) {
        this.#charts.delete(chartKey(s, interval));
      }
      return null;
    },
    query: ({ query }) => this.#query(this.#requireGame(), query),
    setBackgroundMode: async ({ mode }, id) => ({
      tick: (
        await this.#applyGameCommand((tick) => ({ id, tick, type: 'setBackgroundMode', mode }))
      ).tick,
    }),
    openAccount: async ({ bankId, kind }, id) => {
      const { tick, opened } = await this.#applyGameCommand((at) => ({
        id,
        tick: at,
        type: 'openAccount',
        bankId,
        kind,
      }));
      if (opened === undefined) {
        throw new CommandFailure('internal-error', 'openAccount opened no account');
      }
      return { tick, ...opened };
    },
    closeAccount: async ({ accountId, targetAccountId }, id) => ({
      tick: (
        await this.#applyGameCommand((tick) => ({
          id,
          tick,
          type: 'closeAccount',
          accountId,
          ...(targetAccountId === undefined ? {} : { targetAccountId }),
        }))
      ).tick,
    }),
    setSalaryAccount: async ({ accountId }, id) => ({
      tick: (
        await this.#applyGameCommand((tick) => ({ id, tick, type: 'setSalaryAccount', accountId }))
      ).tick,
    }),
    transfer: async ({ fromAccountId, toAccountId, amount, purpose }, id) => ({
      tick: (
        await this.#applyGameCommand((tick) => ({
          id,
          tick,
          type: 'transfer',
          fromAccountId,
          toAccountId,
          amount,
          purpose,
        }))
      ).tick,
    }),
    setAutoPause: async ({ code, enabled }, id) => ({
      tick: (
        await this.#applyGameCommand((tick) => ({ id, tick, type: 'setAutoPause', code, enabled }))
      ).tick,
    }),
    markNotificationsRead: async ({ upTo, seqs }, id) => ({
      tick: (
        await this.#applyGameCommand((tick) => ({
          id,
          tick,
          type: 'markNotificationsRead',
          ...(upTo === undefined ? {} : { upTo }),
          ...(seqs === undefined ? {} : { seqs }),
        }))
      ).tick,
    }),
    updateWatchlist: async ({ ids }, id) => ({
      tick: (await this.#applyGameCommand((tick) => ({ id, tick, type: 'updateWatchlist', ids })))
        .tick,
    }),
  };

  #queue: Promise<void> = Promise.resolve();
  /** Writes that run beside the loop (clock, snapshots, candles); they never reject. */
  readonly #writes = new Set<Promise<void>>();
  /** Plannings of the candle job; they wait for the writes, so they are not writes themselves. */
  readonly #plans = new Set<Promise<void>>();
  #storageFailing = false;
  #game?: LoadedGame;
  #visible = true;
  /** Game commands in progress; the clock holds while it is > 0. */
  #held = 0;
  /**
   * Clock commands being written; their `clock` event waits for the write, so a reload right after
   * it never shows a change the database lacks.
   */
  #clockEventsHeld = 0;
  #timerHandle: unknown;
  #timerActive = false;
  #failed = false;
  #nextId = 1;
  #lastClock: ClockPayload | null = null;
  #lastQuotesTick: number | null = null;
  #quotesStale = false;
  /** The topic `movers` (TS §8.4): one subscription, the service counts its subscribers. */
  #moversSubscribed = false;
  #moversStale = false;
  #lastMoversTick: number | null = null;
  #chartsStale = false;
  #lastChartsTick: number | null = null;
  /** A game command or a load ran: its projection goes out before the reply, unthrottled. */
  #projectionDue = false;

  constructor(ports: EngineHostPorts, options: EngineHostOptions = {}) {
    this.#ports = ports;
    this.#options = options;
    this.#config = { ...DEFAULT_ENGINE_HOST_CONFIG, ...options.config };
    this.#clockThrottle = new Throttle(this.#config.clockPerSecond);
    this.#quotesThrottle = new Throttle(this.#config.quotesPerSecond);
    this.#moversThrottle = new Throttle(this.#config.moversPerSecond);
    this.#candleThrottle = new Throttle(this.#config.candlePerSecond);
    this.#projectionThrottle = new Throttle(this.#config.projectionPerSecond);
    this.#notificationThrottle = new Throttle(this.#config.notificationPerSecond);
  }

  /** Handles a message of the UI; resolves when it is answered. Never rejects. */
  receive(data: unknown): Promise<void> {
    this.#queue = this.#queue.then(() => this.#handle(data));
    return this.#queue;
  }

  /**
   * Resolves when the writes started so far (clock, snapshots, candles) and the planning of the
   * candle job have settled.
   */
  async settled(): Promise<void> {
    while (this.#writes.size > 0 || this.#plans.size > 0) {
      await Promise.allSettled([...this.#writes, ...this.#plans]);
    }
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
    // The clock and the projection go out before the reply, so the UI sees the new state when the
    // command ends.
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
      candleBuffer: [],
      candlesWriting: [],
      candleYears: new Set(),
      candlesWrittenMs: now,
      candleWriteAgain: false,
      backfill: this.#createBackfill(payload.playerId, candles),
      backfillPlanned: false,
      backfillRunning: false,
      backfillProgressMs: now,
      backfillShare: new WorkShare(this.#config.backfillShare, this.#config.passBudgetMs, now),
      unsavedTransactions: [],
      transactionsWrittenMs: now,
      transactionWriteRunning: false,
      savedMonthDay: stored.monthStarts.at(-1)?.day ?? -1,
      clockSavedMs: now,
      clockSavedTick: engine.tick,
      snapshotMs: now,
      snapshotTick: engine.tick,
      changedSinceSnapshot: false,
      changedAccounts: new Set(),
      projectionFull: true,
      unsavedNotifications: [],
      notificationsWrittenMs: now,
      notificationWriteRunning: false,
      outgoingNotifications: [],
      notificationsKey: null,
      watchlistSent: null,
      replaying: true,
      reportIndices: reportIndices(world.world.indices),
      report: null,
    };
    this.#game = game;
    this.#drainEngineEvents(game, true);
    this.#replay(game, stored, payload.minTick);
    game.replaying = false;
    game.pacer.update(
      { backgroundMode: engine.player.backgroundMode },
      engine.tick,
      this.#ports.now(),
    );
    // The first snapshot of a new player, or the replayed state: the next restore starts here.
    const written = this.#snapshotData(game);
    await storageCall(() => storage.saveSnapshot(game.playerId, written.state, written.options));
    this.#snapshotWritten(game, written);
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
    this.#charts.forEach((chart) => (chart.sent = null));
    this.#chartsStale = true;
    this.#projectionDue = true;
    if (target > engine.tick) {
      this.#openAbsence(game);
      this.#startBatch(game, 'catch-up', target);
    } else {
      if (!this.#visible) {
        this.#openAbsence(game);
      }
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
    game.candles.keepSupport = true;
    try {
      replayCommands(game.engine, stored.commands, target);
      this.#drainEngineEvents(game, false);
    } finally {
      game.candles.keepSupport = false;
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
    this.#clockEventsHeld++;
    try {
      game.pacer.update(change, game.engine.tick, this.#ports.now());
      if (change.paused === false) {
        game.autoPause = undefined;
      }
      await this.#saveClock(game);
    } finally {
      this.#clockEventsHeld--;
    }
    return null;
  }

  /** Hidden (TS §3.6, `hidden` and `pagehide`): store the clock with a snapshot. */
  async #setVisibility(visible: boolean): Promise<null> {
    this.#visible = visible;
    const game = this.#game;
    if (game !== undefined) {
      game.pacer.update({ visible }, game.engine.tick, this.#ports.now());
      if (visible) {
        this.#closeAbsence(game);
      } else {
        this.#guarded(() => this.#openAbsence(game));
        await this.#snapshot(game);
      }
    }
    return null;
  }

  /**
   * Accepts a game command (TS §8.5): hold the clock, stamp the command with the current tick,
   * write it ahead, apply it, answer, and go on with a new anchor.
   */
  async #applyGameCommand(
    build: (tick: number) => GameCommand,
  ): Promise<{ tick: number; opened?: OpenedAccount }> {
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
      this.#drainEngineEvents(game, this.#liveHighLow(game));
      this.#projectionDue = true;
      if (!result.ok) {
        throw new CommandFailure(result.error);
      }
      game.pacer.update(
        { backgroundMode: game.engine.player.backgroundMode },
        game.engine.tick,
        this.#ports.now(),
      );
      return result.opened === undefined
        ? { tick: command.tick }
        : { tick: command.tick, opened: result.opened };
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
        const shouldYield = (): boolean =>
          this.#ports.now() - start >= this.#config.passBudgetMs || this.#autoPauseDue(game);
        if (game.batch !== undefined) {
          this.#batchPass(game, game.batch, shouldYield);
        } else {
          const highLow = this.#liveHighLow(game);
          game.candles.keepSupport = !highLow;
          let result: ReturnType<ClockPacer['pass']>;
          try {
            result = game.pacer.pass(game.engine, start, shouldYield);
            this.#drainEngineEvents(game, highLow);
          } finally {
            game.candles.keepSupport = false;
          }
          game.overloaded = result.overloaded && game.pacer.speed !== null;
          this.#periodicWrites(game);
          if (result.reached && !shouldYield()) {
            this.#backfillPass(game, start);
          }
        }
      }
      if (this.#ports.now() - game.candlesWrittenMs >= this.#config.candleWriteIntervalMs) {
        this.#writeCandles(game);
      }
      if (
        this.#ports.now() - game.transactionsWrittenMs >=
        this.#config.transactionWriteIntervalMs
      ) {
        this.#writeTransactions(game);
      }
      if (
        this.#ports.now() - game.notificationsWrittenMs >=
        this.#config.transactionWriteIntervalMs
      ) {
        this.#writeNotifications(game);
      }
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
    game.candles.keepSupport = true;
    let reached: boolean;
    try {
      reached = game.engine.runUntil(batch.to, shouldYield);
      this.#drainEngineEvents(game, false);
    } finally {
      game.candles.keepSupport = false;
    }
    if (game.batch !== batch) {
      // An auto-pause ended the jump.
      return;
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
    if (batch.kind === 'catch-up' && state === 'done') {
      this.#closeAbsence(game);
    }
  }

  /**
   * Engine events, transactions and notifications of the last steps. Transactions and notifications
   * wait for the next write (TS §9.2); notifications also go to the UI (not while catching up) and
   * into a running absence (not while replaying). An auto-pause notification pauses the game when
   * it applies (TS §3.6, §12). `session-closed` buffers the daily candles (TS §6.8): with high and
   * low when `highLow` (live up to `liveHighLowMaxSpeed`), else open and close only, and the
   * background job adds the rest.
   */
  #drainEngineEvents(game: LoadedGame, highLow: boolean): void {
    const trigger = game.engine.autoPauseNotification;
    const transactions = game.engine.drainTransactions();
    const notifications = game.engine.drainNotifications();
    game.unsavedTransactions.push(...transactions);
    game.unsavedNotifications.push(...notifications);
    if (!game.replaying) {
      if (game.absence !== undefined) {
        game.absence = tallyNotifications(tallyBookings(game.absence, transactions), notifications);
      }
      if (this.#runMode(game) !== 'catch-up') {
        game.outgoingNotifications.push(...notifications);
      }
    }
    for (const id of game.engine.drainChangedAccounts()) {
      game.changedAccounts.add(id);
    }
    for (const event of game.engine.drainEvents()) {
      if (event.type === 'session-closed') {
        const closed = game.candles.closed(event.series, event.day, game.engine.tick, highLow);
        this.#bufferCandles(game, closed.patches);
        if (!closed.complete) {
          game.backfill?.addHighLowDays([event.day]);
        }
      }
    }
    if (
      trigger !== null &&
      !game.replaying &&
      autoPauseApplies(this.#runMode(game), this.#visible)
    ) {
      this.#autoPause(game, trigger);
    }
  }

  #runMode(game: LoadedGame): RunMode {
    if (game.replaying || game.batch?.kind === 'catch-up') {
      return 'catch-up';
    }
    return game.batch?.kind === 'jump' ? 'jump' : 'live';
  }

  /** The engine holds a notification whose auto-pause applies now: stop at its tick. */
  #autoPauseDue(game: LoadedGame): boolean {
    return (
      game.engine.autoPauseNotification !== null &&
      !game.replaying &&
      autoPauseApplies(this.#runMode(game), this.#visible)
    );
  }

  /**
   * Auto-pause (TS §3.6, §12): pauses at the current tick, ends a jump, and stores the clock like a
   * pause of the player; the `clock` event waits for the write and names the notification.
   */
  #autoPause(game: LoadedGame, trigger: GameNotification): void {
    if (!game.pacer.settings.paused) {
      game.pacer.update({ paused: true }, game.engine.tick, this.#ports.now());
      game.overloaded = false;
    }
    // The engine marks only notifications of codes with an auto-pause setting.
    game.autoPause = { seq: trigger.seq, code: trigger.code as AutoPauseCode };
    if (game.batch?.kind === 'jump') {
      this.#endBatch(game, 'cancelled');
    }
    this.#clockEventsHeld++;
    void this.#saveClock(game).finally(() => this.#clockEventsHeld--);
  }

  /** Starts an absence (US-BN-03) with the net worth and the index levels now, unless one runs. */
  #openAbsence(game: LoadedGame): void {
    if (game.absence === undefined) {
      game.absence = openAbsence(
        game.engine.tick,
        netWorth(game.engine.player),
        this.#indexLevels(game),
      );
    }
  }

  /**
   * Ends the absence once the app is visible and no catch-up runs; its report goes to the UI and
   * stays for the query, unless nothing was booked or notified.
   */
  #closeAbsence(game: LoadedGame): void {
    const absence = game.absence;
    if (absence === undefined || game.batch?.kind === 'catch-up' || !this.#visible) {
      return;
    }
    game.absence = undefined;
    const tick = game.engine.tick;
    const report = closeAbsence(
      absence,
      tick,
      netWorth(game.engine.player),
      this.#indexLevels(game),
    );
    if (report !== null) {
      game.report = report;
      this.#post('report', report);
    }
  }

  #indexLevels(game: LoadedGame): IndexLevel[] {
    const { engine } = game;
    const { context, world } = engine.world;
    const tick = engine.tick;
    return game.reportIndices.map((x) => {
      const series = indexSeries(context, x);
      const { id, name } = world.indices[x];
      return { series, id, name, level: engine.prices.priceAt(series, tick, tick) };
    });
  }

  /** Live, not jumping and not faster than `liveHighLowMaxSpeed` (TS §6.8, §14.3). */
  #liveHighLow(game: LoadedGame): boolean {
    return (
      game.batch === undefined && liveHighLow(game.pacer.speed, this.#config.liveHighLowMaxSpeed)
    );
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
    this.#writeCandles(game);
    return this.#write(
      () => this.#ports.storage.saveSnapshot(game.playerId, written.state, written.options),
      () => this.#snapshotWritten(game, written),
    );
  }

  /**
   * What a snapshot writes. Events still in the engine's buffer are handled first, because a
   * restore does not bring them back (`GameEngine.restore`).
   */
  #snapshotData(game: LoadedGame): SnapshotData {
    this.#drainEngineEvents(game, this.#liveHighLow(game));
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
      options: {
        monthStarts,
        clock,
        transactions: game.unsavedTransactions.slice(),
        notifications: game.unsavedNotifications.slice(),
        keepNotificationsFrom: oldestKeptSeq(state.player.notifications.nextSeq - 1),
      },
      monthDay: monthStarts.at(-1)?.day ?? game.savedMonthDay,
    };
  }

  #snapshotWritten(game: LoadedGame, written: SnapshotData): void {
    game.savedMonthDay = Math.max(game.savedMonthDay, written.monthDay);
    this.#transactionsSaved(game, written.options.transactions);
    this.#notificationsSaved(game, written.options.notifications);
  }

  /**
   * Writes the transactions not yet stored (TS §9.2), one write at a time. A failed write keeps
   * them for the next one or the next snapshot.
   */
  #writeTransactions(game: LoadedGame): void {
    if (game.unsavedTransactions.length === 0 || game.transactionWriteRunning) {
      return;
    }
    const transactions = game.unsavedTransactions.slice();
    game.transactionWriteRunning = true;
    game.transactionsWrittenMs = this.#ports.now();
    void this.#write(
      () => this.#ports.storage.saveTransactions(game.playerId, transactions),
      () => this.#transactionsSaved(game, transactions),
      () => {
        game.transactionWriteRunning = false;
      },
    );
  }

  #transactionsSaved(game: LoadedGame, saved: readonly Transaction[]): void {
    const last = saved.at(-1);
    if (last !== undefined) {
      game.unsavedTransactions = game.unsavedTransactions.filter(({ seq }) => seq > last.seq);
    }
  }

  /**
   * Writes the notifications not yet stored (TS §9.2) like the transactions. The records never
   * change afterwards; old ones are deleted with the snapshots (`keepNotificationsFrom`).
   */
  #writeNotifications(game: LoadedGame): void {
    if (game.unsavedNotifications.length === 0 || game.notificationWriteRunning) {
      return;
    }
    const notifications = game.unsavedNotifications.slice();
    game.notificationWriteRunning = true;
    game.notificationsWrittenMs = this.#ports.now();
    void this.#write(
      () => this.#ports.storage.saveNotifications(game.playerId, notifications),
      () => this.#notificationsSaved(game, notifications),
      () => {
        game.notificationWriteRunning = false;
      },
    );
  }

  #notificationsSaved(game: LoadedGame, saved: readonly GameNotification[]): void {
    const last = saved.at(-1);
    if (last !== undefined) {
      game.unsavedNotifications = game.unsavedNotifications.filter(({ seq }) => seq > last.seq);
    }
  }

  /**
   * Buffers daily candles (TS §6.8, §9.2): each write reads and writes a bucket per series and
   * calendar year, so they go out together, every `candleWriteIntervalMs`, with each snapshot, on
   * unloading and before a third calendar year enters the buffer. Buffered candles lost in a crash
   * are reproducible; the job finds them missing after the next load.
   */
  #bufferCandles(game: LoadedGame, patches: readonly DailyCandlePatch[]): void {
    for (const patch of patches) {
      const year = candleYear(patch.day);
      if (!game.candleYears.has(year)) {
        if (game.candleYears.size >= 2) {
          this.#writeCandles(game);
        }
        game.candleYears.add(year);
      }
      game.candleBuffer.push(patch);
    }
  }

  /**
   * Writes the buffered daily candles in one transaction, one write at a time; asked for during a
   * write, the next one follows right after it.
   */
  #writeCandles(game: LoadedGame): void {
    if (game.candleBuffer.length === 0) {
      return;
    }
    if (game.candleWrite !== undefined) {
      game.candleWriteAgain = true;
      return;
    }
    const patches = game.candleBuffer;
    game.candleBuffer = [];
    game.candlesWriting = patches;
    game.candleYears.clear();
    game.candlesWrittenMs = this.#ports.now();
    game.candleWrite = this.#write(
      () => this.#ports.storage.saveDailyCandles(game.playerId, patches),
      undefined,
      () => {
        game.candleWrite = undefined;
        game.candlesWriting = [];
        if (game.candleWriteAgain) {
          game.candleWriteAgain = false;
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
      : new CandleBackfill(
          candles,
          this.#ports.storage,
          playerId,
          dayIndex(from),
          this.#config.passBudgetMs,
        );
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
    this.#plans.add(planned);
    void planned.finally(() => this.#plans.delete(planned));
  }

  /**
   * The candle job in the rest of the pass budget, only when the clock reached its target, and
   * within its share of the wall clock (`backfillShare`, TS §6.8): it never holds back game time.
   */
  #backfillPass(game: LoadedGame, passStart: number): void {
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
    const now = this.#ports.now();
    const budgetMs = Math.min(
      game.backfillShare.available(now),
      this.#config.passBudgetMs - (now - passStart),
    );
    if (budgetMs > 0) {
      game.backfillShare.spend(
        backfill.runSlice(beforeDay, this.#ports.now, budgetMs, (patches) =>
          this.#bufferCandles(game, patches),
        ),
      );
    }
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
    if (
      this.#clockEventsHeld === 0 &&
      !sameClock(clock, this.#lastClock) &&
      this.#clockThrottle.isDue(now)
    ) {
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
    if (
      this.#moversSubscribed &&
      (this.#moversStale || tick !== this.#lastMoversTick) &&
      this.#moversThrottle.isDue(now)
    ) {
      const { world, context } = game.engine.world;
      this.#post('movers', { tick, ...marketMovers(world, context, game.engine.prices, tick) });
      this.#moversThrottle.sent(now);
      this.#lastMoversTick = tick;
      this.#moversStale = false;
    }
    if (
      this.#charts.size > 0 &&
      (this.#chartsStale || tick !== this.#lastChartsTick) &&
      this.#candleThrottle.isDue(now)
    ) {
      // The throttle also bounds the computing outside the session, where nothing goes out.
      this.#postCandles(game);
      this.#candleThrottle.sent(now);
      this.#lastChartsTick = tick;
      this.#chartsStale = false;
    }
    const forced = this.#projectionDue;
    this.#projectionDue = false;
    const notifications = this.#notificationsProjection(game);
    const notificationsKey = JSON.stringify(notifications);
    const notificationsChanged = notificationsKey !== game.notificationsKey;
    const watchlistChanged = game.engine.player.watchlist !== game.watchlistSent;
    if (
      (game.projectionFull ||
        game.changedAccounts.size > 0 ||
        notificationsChanged ||
        watchlistChanged) &&
      (forced || this.#projectionThrottle.isDue(now))
    ) {
      this.#postProjection(
        game,
        notificationsChanged ? notifications : undefined,
        watchlistChanged,
      );
      game.notificationsKey = notificationsKey;
      this.#projectionThrottle.sent(now);
    }
    if (
      game.outgoingNotifications.length > 0 &&
      (forced || this.#notificationThrottle.isDue(now))
    ) {
      this.#post('notification', { tick, notifications: game.outgoingNotifications });
      game.outgoingNotifications = [];
      this.#notificationThrottle.sent(now);
    }
  }

  /**
   * `candle` events of the subscribed charts (TS §8.4): the newest candle when it differs from the
   * one sent last, so nothing goes out outside the session. When a new candle began, the event
   * carries the finished one before it. Only the newest candles are computed, never the history.
   */
  #postCandles(game: LoadedGame): void {
    const prices = game.candles.priceSource;
    if (prices === null) {
      return;
    }
    const tick = game.engine.tick;
    const count = seriesCount(game.engine.world.context);
    for (const chart of this.#charts.values()) {
      if (chart.series >= count) {
        continue;
      }
      const candle = latestCandle(prices, chart.series, chart.interval, tick, tick);
      const sent = chart.sent;
      if (candle === null || (sent !== null && sameCandle(sent, candle))) {
        continue;
      }
      const previous =
        sent !== null && sent.tick !== candle.tick
          ? latestCandle(prices, chart.series, chart.interval, candle.tick - 1, tick)
          : null;
      this.#post('candle', {
        tick,
        series: chart.series,
        interval: chart.interval,
        candle,
        ...(previous === null ? {} : { previous }),
      });
      chart.sent = candle;
    }
  }

  /**
   * The changed accounts and the net worth (TS §8.3, §8.4); after loading all accounts. The
   * notification and the watchlist part go with it when they changed or the projection is full.
   */
  #postProjection(
    game: LoadedGame,
    notifications: NotificationsProjection | undefined,
    watchlistChanged: boolean,
  ): void {
    const { player } = game.engine;
    const full = game.projectionFull;
    const part = notifications ?? (full ? this.#notificationsProjection(game) : undefined);
    const watchlist = full || watchlistChanged ? { ids: player.watchlist.slice() } : undefined;
    this.#post('projection', {
      tick: game.engine.tick,
      full,
      accounts: accountViews(player, full ? undefined : [...game.changedAccounts]),
      netWorth: netWorth(player),
      ...(part === undefined ? {} : { notifications: part }),
      ...(watchlist === undefined ? {} : { watchlist }),
    });
    game.watchlistSent = player.watchlist;
    game.projectionFull = false;
    game.changedAccounts.clear();
  }

  #notificationsProjection(game: LoadedGame): NotificationsProjection {
    const state = game.engine.player.notifications;
    const lastSeq = state.nextSeq - 1;
    return {
      lastSeq,
      unread: unreadCount(state, lastSeq),
      autoPause: autoPauseSettings(state.autoPause),
    };
  }

  /** Queries (TS §8.2) answer from the engine's state and the journal; they write nothing. */
  #query(game: LoadedGame, query: EngineQuery): EngineQueryResult | Promise<EngineQueryResult> {
    const { engine } = game;
    switch (query.kind) {
      case 'exchanges':
        return { kind: 'exchanges', exchanges: this.#exchanges(game) };
      case 'banks':
        return { kind: 'banks', banks: engine.world.world.banks.map((bank) => ({ ...bank })) };
      case 'closingPreview': {
        const result = engine.closingPreview(query.accountId);
        if (!result.ok) {
          throw new CommandFailure(result.error);
        }
        return { kind: 'closingPreview', preview: result.preview };
      }
      case 'monthlyValues':
        return {
          kind: 'monthlyValues',
          closedMonths: engine.player.closedMonths.map((closed) => ({ ...closed })),
          current: { month: monthOf(engine.tick), values: { ...engine.player.monthlyValues } },
        };
      case 'statement':
        return this.#statement(game, query);
      case 'notifications':
        return this.#notifications(game, query);
      case 'absenceReport':
        return { kind: 'absenceReport', report: game.report };
      case 'instruments':
        return {
          kind: 'instruments',
          instruments: this.#marketData(game).catalog.map((instrument) => ({ ...instrument })),
        };
      case 'instrumentDetails': {
        const details = instrumentDetails(engine.world.world, query.id);
        if (details === null) {
          throw new CommandFailure('unknown-instrument');
        }
        return { kind: 'instrumentDetails', details };
      }
      case 'screener':
        return this.#screener(game, query);
      case 'candles':
        return this.#candles(game, query);
    }
  }

  /**
   * A block of candles (TS §8.2) up to the tick at the start of the query (the query limit):
   * intraday from the minute curves, daily and weekly from the stored daily candles and the support
   * points. The not yet stored candles are taken before reading, like the statement does.
   */
  async #candles(game: LoadedGame, query: CandlesQuery): Promise<EngineQueryResult> {
    const { engine, candles: source } = game;
    const { context } = engine.world;
    const tick = engine.tick;
    const { series, interval } = query;
    if (series >= seriesCount(context)) {
      throw new CommandFailure('unknown-instrument');
    }
    const prices = source.priceSource;
    if (prices === null) {
      throw new CommandFailure('internal-error', 'the price port has no minute curves');
    }
    const range = {
      from: query.from ?? null,
      to: query.to,
      limit: query.limit ?? MAX_CANDLE_LIMIT,
    };
    const result = { kind: 'candles' as const, series, interval, tick };
    if (isIntraday(interval)) {
      return { ...result, ...intradayCandleBlock(prices, series, interval, range, tick) };
    }
    const { playerId } = game;
    const seriesId = source.ids[series];
    const block = await dailyCandleBlock({
      ...range,
      series,
      seriesId,
      resolution: interval,
      now: tick,
      prices,
      pending: [...game.candlesWriting, ...game.candleBuffer],
      loadBuckets: (fromYear, toYear) =>
        storageCall(() =>
          this.#ports.storage.loadDailyCandles(playerId, seriesId, fromYear, toYear),
        ),
      support: (days) => supportOpenClose(context, source.history, source.tables, series, days),
    });
    return { ...result, ...block };
  }

  /**
   * The screener (TS §8.2) at the current tick, the query limit: closes and dividends come from the
   * cache of daily closes, which moves on with the market days.
   */
  #screener(game: LoadedGame, query: ScreenerQuery): EngineQueryResult {
    const { engine } = game;
    const tick = engine.tick;
    const { catalog, closes } = this.#marketData(game);
    const { kind: _kind, ...criteria } = query;
    const result = screenInstruments(
      { context: engine.world.context, catalog, prices: engine.prices, closes },
      criteria,
      tick,
    );
    return { kind: 'screener', ...result, tick };
  }

  #marketData(game: LoadedGame): MarketData {
    if (game.market === undefined) {
      const { world, context } = game.engine.world;
      const { candles } = game;
      game.market = {
        catalog: instrumentCatalog(world, context),
        closes: new DailyCloses(context, candles.history, candles.tables),
      };
    }
    return game.market;
  }

  /**
   * A page of the notification centre (TS §8.2, US-BN-01) from the stored notifications and those
   * not yet stored, up to the current tick and with the read state of the player state; like the
   * statement, limit, read state and unsaved notifications are taken before reading.
   */
  async #notifications(game: LoadedGame, query: NotificationsQuery): Promise<EngineQueryResult> {
    const { category, offset, limit } = query;
    const tick = game.engine.tick;
    const state = game.engine.player.notifications;
    const read = { readUpTo: state.readUpTo, readSeqs: state.readSeqs.slice() };
    const lastSeq = state.nextSeq - 1;
    const unsaved = game.unsavedNotifications.slice();
    let stored: GameNotification[];
    try {
      stored = await this.#ports.storage.loadNotifications(game.playerId);
    } catch (error) {
      throw new CommandFailure('storage-failed', errorMessage(error));
    }
    const page = notificationPage(mergeNotifications(stored, unsaved), read, {
      tick,
      lastSeq,
      category,
      offset,
      limit,
    });
    return { kind: 'notifications', ...page, tick };
  }

  /**
   * A statement page (TS §7.2, §8.2) from the stored transactions of the account and those not yet
   * stored, up to the current tick: after a restore the store may still hold later ones. The clock
   * runs on while the store is read; the limit and the unsaved transactions are taken before, so a
   * write finishing meanwhile neither adds a later transaction nor loses one.
   */
  async #statement(game: LoadedGame, query: StatementQuery): Promise<EngineQueryResult> {
    const { engine } = game;
    const { accountId, from, to, types, search, offset, limit } = query;
    if (!engine.player.accounts.some(({ id }) => id === accountId)) {
      throw new CommandFailure('unknown-account');
    }
    const tick = engine.tick;
    const unsaved = game.unsavedTransactions.slice();
    const accounts = engine.player.accounts.map((account) => ({ ...account }));
    const bankNames = new Map(engine.world.world.banks.map(({ id, name }) => [id, name]));
    let stored: Transaction[];
    try {
      stored = await this.#ports.storage.loadTransactions(game.playerId, accountId);
    } catch (error) {
      throw new CommandFailure('storage-failed', errorMessage(error));
    }
    const page = statementPage(
      mergeJournal(stored, unsaved),
      { accountId, accounts, bankNames },
      { from, to: Math.min(to ?? tick, tick), types, search },
      { offset, limit },
    );
    return { kind: 'statement', ...page, tick };
  }

  #clockPayload(game: LoadedGame): ClockPayload {
    const { settings } = game.pacer;
    const jumping = game.batch !== undefined;
    const payload: ClockPayload = {
      tick: game.engine.tick,
      speed: settings.speed,
      paused: settings.paused,
      visible: this.#visible,
      backgroundMode: settings.backgroundMode,
      effectiveSpeed: jumping ? null : game.pacer.speed,
      overloaded: !jumping && game.overloaded,
      jumping,
    };
    return game.autoPause === undefined
      ? payload
      : { ...payload, autoPause: { ...game.autoPause } };
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
    return { tick, speed, paused, lastSeenAt, netWorth: netWorth(game.engine.player) };
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
    a.jumping === b.jumping &&
    a.autoPause?.seq === b.autoPause?.seq
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
