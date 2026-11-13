import { inject, PendingTasks, Provider } from '@angular/core';

import { PlayerLocks } from '@app/persistence/data-access/locks/player-locks';
import { FakePlayerLocks } from '@app/persistence/data-access/testing/fake-player-locks';
import { deriveSeedKey } from '@app/simulation/util/seed';
import { MINI_WORLD_CONFIG } from '@app/world/domain/testing/mini-world';
import { generateWorld } from '@app/world/domain/world-generator';

import { ManualTimeline } from './manual-timeline';

import { ENGINE_COMMAND_ID_PREFIX, ENGINE_WORKER_FACTORY } from '../service/engine-service.config';
import {
  EngineCommandMessage,
  EngineEventMessage,
  EngineWorkerPort,
} from '../service/engine-service.model';
import { EngineHost } from '../worker/engine-host';
import { EngineHostOptions, EngineStorage, GeneratedWorld } from '../worker/engine-host.model';
import { InMemoryEngineStorage } from '../worker/in-memory-engine-storage';
import { IndexedDbEngineStorage } from '../worker/indexed-db-engine-storage';

export interface InProcessEngineOptions extends EngineHostOptions {
  /** Wall-clock start in milliseconds since the Unix epoch. */
  startMs?: number;
  /**
   * Storage shared by all workers of the test. `'indexed-db'`: `IndexedDbEngineStorage` on the
   * global `indexedDB` (`fake-indexeddb`, fresh per test in `src/test-setup.ts`), so that the UI's
   * `IndexedDbService` sees what the engine wrote (e.g. `runtime` in the player list). Default: in
   * memory.
   */
  storage?: EngineStorage | 'indexed-db';
  /**
   * Web Locks shared by all workers of this engine. Pass one `FakePlayerLocks` to two engines to
   * stand for two tabs of one browser (`player-locked`).
   */
  locks?: PlayerLocks;
}

/** Mini world of a seed (`world/domain/testing/mini-world.ts`): fast enough for page tests. */
export function generateMiniWorld(seed: string): GeneratedWorld {
  const seedKey = deriveSeedKey(seed);
  return { seedKey, world: generateWorld(seedKey, MINI_WORLD_CONFIG) };
}

/**
 * The engine worker without a thread (CLAUDE.md §10): the same `EngineHost` as in the worker, with
 * a manual wall clock and loop timer. Messages are copied like `postMessage` does and delivered in
 * a later task. Command handling and every delivery are Angular pending tasks, so
 * `fixture.whenStable()` waits for replies and events; the running loop is not, so tests move the
 * game time with `advance`.
 */
export class InProcessEngine {
  readonly timeline: ManualTimeline;
  readonly storage: EngineStorage;
  readonly locks: PlayerLocks;
  /** Every worker the service started, the current one last. */
  readonly workers: InProcessEngineWorker[] = [];
  #services = 0;
  readonly #options: EngineHostOptions;
  #inFlight = 0;

  constructor(options: InProcessEngineOptions = {}) {
    const { startMs, storage, locks, ...hostOptions } = options;
    this.timeline = new ManualTimeline(startMs);
    this.storage =
      storage === 'indexed-db'
        ? new IndexedDbEngineStorage()
        : (storage ?? new InMemoryEngineStorage());
    this.locks = locks ?? new FakePlayerLocks();
    // The candle job would recompute years of the mini world in one pass of the manual timeline.
    this.#options = { createWorld: generateMiniWorld, candleBackfillFrom: null, ...hostOptions };
  }

  /** Prefix of the command IDs of the next `EngineService` on this engine (`s1`, `s2`, …). */
  nextCommandIdPrefix(): string {
    return `s${++this.#services}`;
  }

  get current(): InProcessEngineWorker | undefined {
    const last = this.workers[this.workers.length - 1];
    return last?.terminated ? undefined : last;
  }

  now(): number {
    return this.timeline.now();
  }

  /** Moves the wall clock forward, runs the loop passes on the way and delivers what they sent. */
  async advance(ms: number): Promise<void> {
    await this.idle();
    this.timeline.advance(ms);
    await this.idle();
  }

  /**
   * Waits until every posted message is handled, every reply and event is delivered and the writes
   * of the host have settled.
   */
  async idle(): Promise<void> {
    do {
      await new Promise<void>((resolve) => setTimeout(resolve));
      await this.current?.host.settled();
    } while (this.#inFlight > 0);
  }

  /** Lets the current worker fail like a worker that throws (`error` event). */
  crash(message = 'crash'): void {
    this.current?.fail(message);
  }

  createWorker(pendingTasks: PendingTasks): InProcessEngineWorker {
    const worker = new InProcessEngineWorker(
      (task) => this.#run(pendingTasks, task),
      (post) =>
        new EngineHost(
          {
            now: this.timeline.now,
            post,
            timer: this.timeline,
            storage: this.storage,
            locks: this.locks,
          },
          this.#options,
        ),
    );
    this.workers.push(worker);
    return worker;
  }

  /** Runs `task` in a later macrotask as a pending task. */
  #run(pendingTasks: PendingTasks, task: () => void | Promise<void>): void {
    const done = pendingTasks.add();
    this.#inFlight++;
    setTimeout(async () => {
      try {
        await task();
      } finally {
        this.#inFlight--;
        done();
      }
    });
  }
}

type Run = (task: () => void | Promise<void>) => void;

export class InProcessEngineWorker implements EngineWorkerPort {
  readonly host: EngineHost;
  /** Commands the service posted, in order. */
  readonly received: EngineCommandMessage[] = [];
  readonly #run: Run;
  readonly #messageListeners: Array<(event: MessageEvent<unknown>) => void> = [];
  readonly #errorListeners: Array<(event: Event) => void> = [];
  #terminated = false;

  constructor(run: Run, createHost: (post: (message: EngineEventMessage) => void) => EngineHost) {
    this.#run = run;
    this.host = createHost((message) => this.#deliver(message));
  }

  get terminated(): boolean {
    return this.#terminated;
  }

  postMessage(message: EngineCommandMessage): void {
    const copy = structuredClone(message);
    this.received.push(copy);
    this.#run(async () => {
      if (!this.#terminated) {
        await this.host.receive(copy);
      }
    });
  }

  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  addEventListener(type: 'error' | 'messageerror', listener: (event: Event) => void): void;
  addEventListener(
    type: 'message' | 'error' | 'messageerror',
    listener: ((event: MessageEvent<unknown>) => void) | ((event: Event) => void),
  ): void {
    if (type === 'message') {
      this.#messageListeners.push(listener as (event: MessageEvent<unknown>) => void);
    } else {
      this.#errorListeners.push(listener as (event: Event) => void);
    }
  }

  terminate(): void {
    this.#terminated = true;
    this.host.dispose();
  }

  fail(message: string): void {
    const event = new ErrorEvent('error', { message });
    this.#errorListeners.forEach((listener) => listener(event));
  }

  #deliver(message: EngineEventMessage): void {
    const copy = structuredClone(message);
    this.#run(() => {
      if (!this.#terminated) {
        const event = new MessageEvent('message', { data: copy });
        this.#messageListeners.forEach((listener) => listener(event));
      }
    });
  }
}

/**
 * Replaces the real worker with the in-process engine (provide it at the root injector). Keep the
 * `InProcessEngine` in the test to move the time: `await engine.advance(1000)`.
 */
export function provideInProcessEngineWorker(engine = new InProcessEngine()): Provider {
  return [
    {
      provide: ENGINE_WORKER_FACTORY,
      useFactory: () => {
        const pendingTasks = inject(PendingTasks);
        return () => engine.createWorker(pendingTasks);
      },
    },
    // Deterministic command IDs: every service on this engine gets its own prefix (`s1`, `s2`, …).
    { provide: ENGINE_COMMAND_ID_PREFIX, useValue: () => engine.nextCommandIdPrefix() },
  ];
}
