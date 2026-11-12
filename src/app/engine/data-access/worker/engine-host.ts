import { TradingHours } from '@app/clock/domain/models/time.model';
import { ClockPacer } from '@app/engine/domain/clock-pacing-logic';
import { GameEngine } from '@app/engine/domain/game-engine';
import { createGameWorld } from '@app/engine/domain/game-world';
import { jumpTargetTick } from '@app/engine/domain/jump-target-logic';
import { ClockSettings } from '@app/engine/domain/models/engine-clock.model';
import { GameCommand } from '@app/engine/domain/models/engine-command.model';
import { EngineEvent } from '@app/engine/domain/models/engine-event.model';
import { seriesQuote } from '@app/engine/domain/series-quote';
import { Throttle } from '@app/engine/domain/throttle-logic';
import { seriesCount } from '@app/market/domain/series';
import { deriveSeedKey } from '@app/simulation/util/seed';
import { generateWorld } from '@app/world/domain/world-generator';

import {
  DEFAULT_ENGINE_HOST_CONFIG,
  EngineHostConfig,
  EngineHostOptions,
  EngineHostPorts,
  GeneratedWorld,
  StoredClock,
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

interface Jump {
  from: number;
  to: number;
  lastProgressMs: number;
}

interface LoadedGame {
  playerId: string;
  engine: GameEngine;
  pacer: ClockPacer;
  sessions: readonly TradingHours[];
  overloaded: boolean;
  jump?: Jump;
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
      game.jump = { from: game.engine.tick, to, lastProgressMs: this.#ports.now() };
      this.#progress({ kind: 'jump', state: 'running', done: 0, total: to - game.engine.tick });
      this.#restartLoop(0);
      return { targetTick: to };
    },
    cancelJump: () => {
      if (this.#game?.jump !== undefined) {
        this.#endJump(this.#game, 'cancelled');
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

  /** Stops the loop, e.g. before the worker is terminated. */
  dispose(): void {
    this.#stopLoop();
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

  async #load(payload: LoadPlayerPayload): Promise<EngineReplies['loadPlayer']> {
    if (this.#game !== undefined) {
      await this.#unload();
    }
    this.#progress({ kind: 'init', state: 'running', done: 0, total: 1 });
    const generated = (this.#options.createWorld ?? generateStandardWorld)(payload.seed);
    const world = createGameWorld(generated.seedKey, generated.world);
    const engine = GameEngine.start(world, payload.start, { prices: this.#options.prices });
    const settings: ClockSettings = {
      speed: this.#options.initialSpeed ?? '1min',
      paused: true,
      visible: this.#visible,
      backgroundMode: engine.player.backgroundMode,
    };
    const game: LoadedGame = {
      playerId: payload.playerId,
      engine,
      pacer: new ClockPacer(settings, engine.tick, this.#ports.now()),
      sessions: world.exchanges.map(({ open, close }) => ({ open, close })),
      overloaded: false,
    };
    this.#game = game;
    this.#drainEngineEvents(game);
    this.#progress({ kind: 'init', state: 'done', done: 1, total: 1 });
    this.#lastClock = null;
    this.#quotesStale = true;
    this.#restartLoop(this.#config.loopIntervalMs);
    return { playerId: game.playerId, tick: engine.tick };
  }

  async #unload(): Promise<null> {
    const game = this.#game;
    if (game === undefined) {
      return null;
    }
    if (game.jump !== undefined) {
      this.#endJump(game, 'cancelled');
    }
    this.#stopLoop();
    this.#game = undefined;
    await this.#ports.storage.saveClock(game.playerId, this.#storedClock(game));
    return null;
  }

  async #changeClock(change: Partial<ClockSettings>): Promise<null> {
    const game = this.#requireIdle();
    game.pacer.update(change, game.engine.tick, this.#ports.now());
    await this.#ports.storage.saveClock(game.playerId, this.#storedClock(game));
    return null;
  }

  async #setVisibility(visible: boolean): Promise<null> {
    this.#visible = visible;
    const game = this.#game;
    if (game !== undefined) {
      game.pacer.update({ visible }, game.engine.tick, this.#ports.now());
      if (!visible) {
        await this.#ports.storage.saveClock(game.playerId, this.#storedClock(game));
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
      this.#drainEngineEvents(game);
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
    if (game.jump !== undefined) {
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

  /** One pass of the loop (TS §3.5): run within the time budget, then send what is due. */
  #pass(): void {
    const game = this.#game;
    if (game === undefined || this.#failed) {
      return;
    }
    this.#guarded(() => {
      if (this.#held === 0) {
        const start = this.#ports.now();
        const shouldYield = (): boolean => this.#ports.now() - start >= this.#config.passBudgetMs;
        if (game.jump !== undefined) {
          this.#jumpPass(game, game.jump, shouldYield);
        } else {
          game.overloaded = game.pacer.pass(game.engine, start, shouldYield).overloaded;
        }
        this.#drainEngineEvents(game);
      }
      this.#flush();
      this.#schedule(game.jump !== undefined ? 0 : this.#config.loopIntervalMs);
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

  /** Batch mode of a jump (TS §3.7): runs to the target; progress about every 100 ms. */
  #jumpPass(game: LoadedGame, jump: Jump, shouldYield: () => boolean): void {
    if (game.engine.runUntil(jump.to, shouldYield)) {
      this.#endJump(game, 'done');
      return;
    }
    const now = this.#ports.now();
    if (now - jump.lastProgressMs >= this.#config.progressIntervalMs) {
      jump.lastProgressMs = now;
      this.#progress({
        kind: 'jump',
        state: 'running',
        done: game.engine.tick - jump.from,
        total: jump.to - jump.from,
      });
    }
  }

  #endJump(game: LoadedGame, state: 'done' | 'cancelled'): void {
    const jump = game.jump;
    if (jump === undefined) {
      return;
    }
    game.jump = undefined;
    game.pacer.reanchor(game.engine.tick, this.#ports.now());
    this.#progress({
      kind: 'jump',
      state,
      done: game.engine.tick - jump.from,
      total: jump.to - jump.from,
    });
  }

  /**
   * Engine events of the last steps. M2 forwards none of them; notifications and the absence
   * report follow in M3.
   */
  #drainEngineEvents(game: LoadedGame): void {
    for (const event of game.engine.drainEvents()) {
      if (event.type === 'session-closed') {
        this.#onSessionClosed(game, event);
      }
    }
  }

  /** Hook of AP 2.3: write the daily candles of `event.series` for `event.day` (TS §6.8, §3.8). */
  #onSessionClosed(
    _game: LoadedGame,
    _event: Extract<EngineEvent, { type: 'session-closed' }>,
  ): void {
    // Daily candles are stored from AP 2.3 on.
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
    const jumping = game.jump !== undefined;
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

  #storedClock(game: LoadedGame): StoredClock {
    const { speed, paused } = game.pacer.settings;
    return { tick: game.engine.tick, speed, paused, lastSeenAt: this.#ports.now() };
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
