// Framework-free: the engine worker holds the lock while it simulates a player, the UI takes it
// before it deletes one (TS §9.4).

/** Name of the Web Lock of a player. */
export function playerLockName(playerId: string): string {
  return `pgo:player:${playerId}`;
}

export interface PlayerLock {
  /** Releases the lock; further calls do nothing. */
  release(): void;
}

/** Port for the exclusive lock of a player (TS §9.4); a fake in tests. */
export interface PlayerLocks {
  /** Takes the lock if it is free; `null` when another tab holds it. Never waits for it. */
  acquire(playerId: string): Promise<PlayerLock | null>;
}

/** Web Locks (`navigator.locks`), available in windows and workers. */
export class WebPlayerLocks implements PlayerLocks {
  readonly #locks: LockManager;

  constructor(locks: LockManager) {
    this.#locks = locks;
  }

  acquire(playerId: string): Promise<PlayerLock | null> {
    return new Promise<PlayerLock | null>((resolve, reject) => {
      this.#locks
        .request(playerLockName(playerId), { ifAvailable: true }, (lock) => {
          if (lock === null) {
            resolve(null);
            return undefined;
          }
          // The lock is held until the promise returned here settles.
          return new Promise<void>((release) => resolve({ release: () => release() }));
        })
        .catch(reject);
    });
  }
}
