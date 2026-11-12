import { PlayerLock, playerLockName, PlayerLocks } from '../locks/player-locks';

/**
 * Web Locks of one browser profile for tests (`ifAvailable` semantics, TS §9.4). Share one instance
 * between the engines or services that stand for different tabs.
 */
export class FakePlayerLocks implements PlayerLocks {
  readonly #held = new Set<string>();

  /** Names of the locks held right now. */
  get held(): string[] {
    return [...this.#held];
  }

  async acquire(playerId: string): Promise<PlayerLock | null> {
    const name = playerLockName(playerId);
    if (this.#held.has(name)) {
      return null;
    }
    this.#held.add(name);
    let released = false;
    return {
      release: () => {
        if (!released) {
          released = true;
          this.#held.delete(name);
        }
      },
    };
  }
}
