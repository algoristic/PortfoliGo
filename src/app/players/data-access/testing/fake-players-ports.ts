import { Provider } from '@angular/core';

import { PlayerLocks } from '@app/persistence/data-access/locks/player-locks';
import { FakePlayerLocks } from '@app/persistence/data-access/testing/fake-player-locks';

import {
  MessageChannelPort,
  PLAYER_LOCKS,
  PLAYERS_CHANNEL_FACTORY,
  PLAYERS_CLOCK,
  PLAYERS_RANDOM,
  STORAGE_PERSISTENCE,
  StoragePersistencePort,
} from '../service/players-service.config';

/**
 * `BroadcastChannel`s of one browser profile for tests: a message reaches every other open channel
 * of the hub (not the sender), as a structured clone in a microtask, so awaiting any promise delivers it.
 */
export class FakeBroadcastHub {
  readonly #channels = new Set<FakeChannel>();
  /** Every message posted on any channel, in order. */
  readonly posted: unknown[] = [];

  createChannel(): MessageChannelPort {
    const channel = new FakeChannel(this);
    this.#channels.add(channel);
    return channel;
  }

  /** Posts a message as another tab would. */
  postFromOtherTab(message: unknown): void {
    this.deliver(undefined, message);
  }

  /** @internal */
  deliver(sender: FakeChannel | undefined, message: unknown): void {
    this.posted.push(message);
    for (const channel of this.#channels) {
      if (channel !== sender) {
        const copy = structuredClone(message);
        queueMicrotask(() => channel.receive(copy));
      }
    }
  }

  /** @internal */
  remove(channel: FakeChannel): void {
    this.#channels.delete(channel);
  }
}

class FakeChannel implements MessageChannelPort {
  readonly #hub: FakeBroadcastHub;
  readonly #listeners = new Set<(event: MessageEvent) => void>();
  #closed = false;

  constructor(hub: FakeBroadcastHub) {
    this.#hub = hub;
  }

  postMessage(message: unknown): void {
    if (this.#closed) {
      throw new DOMException('The channel is closed', 'InvalidStateError');
    }
    this.#hub.deliver(this, message);
  }

  addEventListener(_type: 'message', listener: (event: MessageEvent) => void): void {
    this.#listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: (event: MessageEvent) => void): void {
    this.#listeners.delete(listener);
  }

  close(): void {
    this.#closed = true;
    this.#hub.remove(this);
  }

  receive(data: unknown): void {
    if (!this.#closed) {
      const event = new MessageEvent('message', { data });
      this.#listeners.forEach((listener) => listener(event));
    }
  }
}

/** `navigator.storage` with a fixed answer; counts the requests. */
export class FakeStoragePersistence implements StoragePersistencePort {
  requests = 0;
  #persisted = false;
  readonly #grant: boolean;

  constructor(grant = true) {
    this.#grant = grant;
  }

  async persisted(): Promise<boolean> {
    return this.#persisted;
  }

  async persist(): Promise<boolean> {
    this.requests++;
    this.#persisted = this.#grant;
    return this.#persisted;
  }
}

/** Deterministic random 32-bit words (a counter), for player IDs and seed suggestions. */
export function counterRandom(start = 1): () => number {
  let next = start;
  return () => next++ >>> 0;
}

export interface PlayersTestPorts {
  /** Share the locks with the in-process engine (`InProcessEngine.locks`) in page tests. */
  locks?: PlayerLocks;
  hub?: FakeBroadcastHub;
  persistence?: StoragePersistencePort;
  /** Wall clock in milliseconds; defaults to 13.11.2026, 12:00 UTC. */
  clock?: () => number;
  random?: () => number;
}

/** Replaces the platform ports of the `PlayersService`; provide it at the root injector. */
export function providePlayersTestPorts(ports: PlayersTestPorts = {}): Provider[] {
  const hub = ports.hub ?? new FakeBroadcastHub();
  return [
    { provide: PLAYER_LOCKS, useValue: ports.locks ?? new FakePlayerLocks() },
    { provide: PLAYERS_CHANNEL_FACTORY, useValue: () => hub.createChannel() },
    { provide: STORAGE_PERSISTENCE, useValue: ports.persistence ?? new FakeStoragePersistence() },
    { provide: PLAYERS_CLOCK, useValue: ports.clock ?? (() => Date.UTC(2026, 10, 13, 12)) },
    { provide: PLAYERS_RANDOM, useValue: ports.random ?? counterRandom() },
  ];
}
