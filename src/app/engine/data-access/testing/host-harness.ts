import { PlayerLocks } from '@app/persistence/data-access/locks/player-locks';

import { generateMiniWorld } from './in-process-engine-worker';
import { ManualTimeline } from './manual-timeline';

import {
  ClockPayload,
  EngineCommandMessage,
  EngineCommandPayloads,
  EngineCommandType,
  EngineEventMessage,
  EngineEventPayloads,
  EngineEventType,
  ProgressPayload,
  QuotesPayload,
} from '../service/engine-service.model';
import { EngineHost } from '../worker/engine-host';
import { EngineHostOptions, EngineStorage } from '../worker/engine-host.model';
import { InMemoryEngineStorage } from '../worker/in-memory-engine-storage';

const EPOCH_MS = Date.UTC(2020, 0, 1);

/** Tick of a game date and time, independent of the calendar functions (`Date.UTC`). */
export function gameTick(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return (Date.UTC(year, month - 1, day, hour, minute) - EPOCH_MS) / 60_000;
}

export const GAME_START = gameTick(2030, 4, 1);

export const MINI_PLAYER = {
  playerId: 'p1',
  seed: 'mini-1',
  start: { startCapital: 1_000_000, netIncome: 280_000, livingCosts: 170_000 },
};

/** A pass every 10 ms and a clock event per pass, so that passes fall on whole seconds. */
export const FINE = { loopIntervalMs: 10, clockPerSecond: 100 };

export interface Sent {
  atMs: number;
  message: EngineEventMessage;
}

export interface HostHarnessPorts {
  storage?: EngineStorage;
  locks?: PlayerLocks;
  /** Wall-clock start of the manual timeline. */
  startMs?: number;
}

/**
 * The worker host on the mini world with a manual timeline, recording what it posts. The candle job
 * is off unless the options set `candleBackfillFrom`.
 */
export class HostHarness {
  readonly timeline: ManualTimeline;
  readonly storage: EngineStorage;
  readonly sent: Sent[] = [];
  readonly host: EngineHost;
  /** ID of the last command sent (`t1`, `t2`, …), e.g. to log a confirmed game command. */
  lastId = '';
  #nextId = 1;

  constructor(options: EngineHostOptions = {}, ports: HostHarnessPorts = {}) {
    this.timeline = new ManualTimeline(ports.startMs);
    this.storage = ports.storage ?? new InMemoryEngineStorage();
    this.host = new EngineHost(
      {
        now: this.timeline.now,
        post: (message) =>
          this.sent.push({ atMs: this.timeline.now(), message: structuredClone(message) }),
        timer: this.timeline,
        storage: this.storage,
        locks: ports.locks,
      },
      { createWorld: generateMiniWorld, candleBackfillFrom: null, ...options },
    );
  }

  /** Posts a command and resolves with its reply. */
  async send<K extends EngineCommandType>(
    type: K,
    payload: EngineCommandPayloads[K],
  ): Promise<EngineEventPayloads['reply']> {
    const id = `t${this.#nextId++}`;
    this.lastId = id;
    await this.host.receive({ protocol: 1, id, type, payload } as EngineCommandMessage);
    return this.replyTo(id);
  }

  replyTo(id: string): EngineEventPayloads['reply'] {
    const reply = this.sent.find(
      ({ message }) => message.type === 'reply' && message.replyTo === id,
    );
    if (reply === undefined) {
      throw new Error(`no reply to ${id}`);
    }
    return reply.message.payload as EngineEventPayloads['reply'];
  }

  events<K extends EngineEventType>(
    type: K,
  ): Array<{ atMs: number; payload: EngineEventPayloads[K] }> {
    return this.sent
      .filter(({ message }) => message.type === type)
      .map(({ atMs, message }) => ({ atMs, payload: message.payload as EngineEventPayloads[K] }));
  }

  get clock(): ClockPayload {
    const clocks = this.events('clock');
    return clocks[clocks.length - 1].payload;
  }

  get quotes(): QuotesPayload {
    const quotes = this.events('quotes');
    return quotes[quotes.length - 1].payload;
  }

  get progress(): ProgressPayload[] {
    return this.events('progress').map(({ payload }) => payload);
  }
}

export async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

/** Real time of `ms` milliseconds, one pass after the other, then the writes settle. */
export async function advance(harness: HostHarness, ms: number): Promise<void> {
  harness.timeline.advance(ms);
  await flushMicrotasks();
  await harness.host.settled();
}

/**
 * Runs one pass after the other (the clock moves to each due time, see `ManualTimeline.step`) until
 * `done` holds, e.g. a batch run (0 ms between passes) or the candle job after its asynchronous
 * planning.
 */
export async function runUntil(
  harness: HostHarness,
  done: () => boolean,
  maxPasses = 10_000,
): Promise<void> {
  for (let pass = 0; !done(); pass++) {
    if (pass >= maxPasses) {
      throw new Error('runUntil: condition not reached');
    }
    harness.timeline.step();
    await flushMicrotasks();
    await harness.host.settled();
  }
}
