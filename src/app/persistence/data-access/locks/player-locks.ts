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
  /**
   * Takes the lock if it is free or becomes free within a short grace period; `null` when another
   * tab holds it.
   */
  acquire(playerId: string): Promise<PlayerLock | null>;
}

/**
 * How long `WebPlayerLocks` waits for a held lock. A reloaded page starts before the worker of the
 * old one has ended and released its lock; from the cache of the service worker it starts fast
 * enough to meet that lock (AP 6.3). Another tab keeps it longer.
 */
export const PLAYER_LOCK_WAIT_MS = 2_000;

/** Web Locks (`navigator.locks`), available in windows and workers. */
export class WebPlayerLocks implements PlayerLocks {
  readonly #locks: LockManager;

  constructor(locks: LockManager) {
    this.#locks = locks;
  }

  acquire(playerId: string): Promise<PlayerLock | null> {
    return new Promise<PlayerLock | null>((resolve, reject) => {
      this.#locks
        .request(
          playerLockName(playerId),
          { signal: AbortSignal.timeout(PLAYER_LOCK_WAIT_MS) },
          // The lock is held until the promise returned here settles.
          () => new Promise<void>((release) => resolve({ release: () => release() })),
        )
        .catch((error: unknown) =>
          error instanceof DOMException &&
          (error.name === 'TimeoutError' || error.name === 'AbortError')
            ? resolve(null)
            : reject(error),
        );
    });
  }
}
