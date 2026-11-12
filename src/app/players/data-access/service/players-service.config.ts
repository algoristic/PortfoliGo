import { DOCUMENT, inject, InjectionToken } from '@angular/core';

import { PlayerLocks, WebPlayerLocks } from '@app/persistence/data-access/locks/player-locks';

// Platform ports of the `PlayersService` (TS §9.4, §9.5). Each has a root default, so page tests
// replace them at the root injector (`providePlayersTestPorts()` in `../testing`).

/** Name of the app's `BroadcastChannel` (TS §9.4). */
export const APP_CHANNEL_NAME = 'pgo';

/** The part of `BroadcastChannel` the service uses. */
export interface MessageChannelPort {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  close(): void;
}

/** `navigator.storage` as far as the persistence request needs it (TS §9.5). */
export interface StoragePersistencePort {
  persisted(): Promise<boolean>;
  persist(): Promise<boolean>;
}

/** Web Locks of the players; the UI takes them before it deletes a player. */
export const PLAYER_LOCKS = new InjectionToken<PlayerLocks>('PLAYER_LOCKS', {
  providedIn: 'root',
  factory: () => new WebPlayerLocks(inject(DOCUMENT).defaultView?.navigator.locks as LockManager),
});

/** Opens the app's channel to the other tabs; called once per service, on first use. */
export const PLAYERS_CHANNEL_FACTORY = new InjectionToken<() => MessageChannelPort>(
  'PLAYERS_CHANNEL_FACTORY',
  {
    providedIn: 'root',
    factory: () => () => new BroadcastChannel(APP_CHANNEL_NAME),
  },
);

const NO_PERSISTENCE: StoragePersistencePort = {
  persisted: () => Promise.resolve(false),
  persist: () => Promise.resolve(false),
};

export const STORAGE_PERSISTENCE = new InjectionToken<StoragePersistencePort>(
  'STORAGE_PERSISTENCE',
  {
    providedIn: 'root',
    factory: () => {
      const storage = inject(DOCUMENT).defaultView?.navigator.storage;
      return storage?.persist === undefined ? NO_PERSISTENCE : storage;
    },
  },
);

/** Wall clock in milliseconds since the Unix epoch (creation time of a profile). */
export const PLAYERS_CLOCK = new InjectionToken<() => number>('PLAYERS_CLOCK', {
  providedIn: 'root',
  factory: () => () => Date.now(),
});

/** Random unsigned 32-bit integers for player IDs and seed suggestions (not the simulation). */
export const PLAYERS_RANDOM = new InjectionToken<() => number>('PLAYERS_RANDOM', {
  providedIn: 'root',
  factory: () => () => crypto.getRandomValues(new Uint32Array(1))[0],
});

/** Version of the `pgo.lastPlayerId` entry (TS §9.3). */
export const LAST_PLAYER_ID_VERSION = 1;
