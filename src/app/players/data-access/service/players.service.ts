import { DestroyRef, inject, Injectable } from '@angular/core';
import { IDBPDatabase } from 'idb';
import { defer, firstValueFrom, map, Observable, share } from 'rxjs';

import type {
  RuntimeRecord,
  SnapshotRecord,
} from '@app/engine/data-access/worker/indexed-db-engine-storage.model';
import { LocalStorageService } from '@app/persistence/data-access/local-storage/local-storage.service';
import { WORKER_STORES } from '@app/persistence/data-access/schema/idb-schema';
import { openPortfoligoDb } from '@app/persistence/data-access/schema/open-database';
import {
  deletePlayerRecords,
  playerKeyRange,
} from '@app/persistence/data-access/schema/player-records';
import { NewPlayer, PlayerListEntry, PlayerProfile } from '@app/players/domain/models/player.model';
import {
  createPlayerProfile,
  normalizePlayerName,
  playerNameError,
  sortPlayerList,
  toPlayerListEntry,
} from '@app/players/domain/player-logic';
import { generateSeed } from '@app/simulation/util/seed-generator';

import {
  LAST_PLAYER_ID_VERSION,
  MessageChannelPort,
  PLAYER_LOCKS,
  PLAYERS_CHANNEL_FACTORY,
  PLAYERS_CLOCK,
  PLAYERS_RANDOM,
  STORAGE_PERSISTENCE,
} from './players-service.config';
import {
  CreatedPlayer,
  PlayerChange,
  PlayersChangedMessage,
  PlayersServiceError,
} from './players-service.model';
import { createPlayerId, isPlayersChangedMessage } from './players-service.utils';

/**
 * Profiles in the `players` store (owned by the UI, TS §9.1), the player list with the worker's
 * clock and versions, deleting a player with all its data (TS §9.4), the last used player
 * (TS §9.3) and persistent storage (TS §9.5). Changes are reported to other tabs.
 */
@Injectable()
export class PlayersService {
  readonly #localStorage = inject(LocalStorageService);
  readonly #locks = inject(PLAYER_LOCKS);
  readonly #createChannel = inject(PLAYERS_CHANNEL_FACTORY);
  readonly #persistence = inject(STORAGE_PERSISTENCE);
  readonly #now = inject(PLAYERS_CLOCK);
  readonly #random = inject(PLAYERS_RANDOM);

  #database: Promise<IDBPDatabase> | undefined;
  #channel: MessageChannelPort | undefined;

  /** Changes of the player list made in other tabs. */
  readonly changes$: Observable<PlayersChangedMessage> = new Observable<PlayersChangedMessage>(
    (subscriber) => {
      const channel = this.#openChannel();
      const listener = (event: MessageEvent): void => {
        if (isPlayersChangedMessage(event.data)) {
          subscriber.next(event.data);
        }
      };
      channel.addEventListener('message', listener);
      return () => channel.removeEventListener('message', listener);
    },
  ).pipe(share());

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#channel?.close();
      void this.#database?.then((database) => database.close());
    });
  }

  /** All players, most recently used first. */
  loadPlayers(): Observable<PlayerListEntry[]> {
    return defer(async () => {
      const database = await this.#db();
      const transaction = database.transaction(['players', 'runtime', 'snapshots'], 'readonly');
      const profiles = (await transaction.objectStore('players').getAll()) as PlayerProfile[];
      const entries: PlayerListEntry[] = [];
      for (const profile of profiles) {
        const runtime = (await transaction.objectStore('runtime').get(profile.id)) as
          RuntimeRecord | undefined;
        const newest = await transaction
          .objectStore('snapshots')
          .openCursor(playerKeyRange(profile.id), 'prev');
        const snapshot = newest?.value as SnapshotRecord | undefined;
        entries.push(
          toPlayerListEntry(
            profile,
            runtime,
            snapshot && { simVersion: snapshot.simVersion, schemaVersion: snapshot.schemaVersion },
          ),
        );
      }
      await transaction.done;
      return sortPlayerList(entries);
    });
  }

  getProfile(playerId: string): Observable<PlayerProfile | undefined> {
    return defer(async () => {
      const database = await this.#db();
      return (await database.get('players', playerId)) as PlayerProfile | undefined;
    });
  }

  /** Creates the profile; the worker creates the game when it loads the player the first time. */
  createPlayer(input: NewPlayer): Observable<CreatedPlayer> {
    return defer(async () => {
      const profile = createPlayerProfile(input, createPlayerId(this.#random), this.#now());
      const database = await this.#db();
      const transaction = database.transaction('players', 'readwrite');
      const store = transaction.objectStore('players');
      const others = await store.count();
      await store.add(profile);
      await transaction.done;
      this.#broadcast('created', profile.id);
      return { profile, firstPlayer: others === 0 };
    });
  }

  /** Read-modify-write of the profile; only the name changes (TS §9.1). */
  renamePlayer(playerId: string, name: string): Observable<PlayerProfile> {
    return defer(async () => {
      if (playerNameError(name) !== null) {
        throw new PlayersServiceError('invalid-input', playerId);
      }
      const database = await this.#db();
      const transaction = database.transaction('players', 'readwrite');
      const store = transaction.objectStore('players');
      const profile = (await store.get(playerId)) as PlayerProfile | undefined;
      if (profile === undefined) {
        transaction.abort();
        await transaction.done.catch(() => undefined);
        throw new PlayersServiceError('player-not-found', playerId);
      }
      const renamed = { ...profile, name: normalizePlayerName(name) };
      await store.put(renamed);
      await transaction.done;
      this.#broadcast('renamed', playerId);
      return renamed;
    });
  }

  /**
   * Deletes the player with all its records in one transaction. It takes the player's Web Lock
   * first: while another tab runs the player, it fails with `player-locked` (TS §9.4). It also
   * forgets the player as the last used one.
   */
  deletePlayer(playerId: string): Observable<void> {
    return defer(async () => {
      const lock = await this.#locks.acquire(playerId);
      if (lock === null) {
        throw new PlayersServiceError('player-locked', playerId);
      }
      try {
        const database = await this.#db();
        await deletePlayerRecords(database, playerId, [...WORKER_STORES, 'players']);
      } finally {
        lock.release();
      }
      if ((await firstValueFrom(this.getLastPlayerId())) === playerId) {
        await firstValueFrom(this.#localStorage.remove('pgo.lastPlayerId'));
      }
      this.#broadcast('deleted', playerId);
    });
  }

  getLastPlayerId(): Observable<string | undefined> {
    return this.#localStorage
      .get<unknown>('pgo.lastPlayerId', LAST_PLAYER_ID_VERSION)
      .pipe(map((id) => (typeof id === 'string' ? id : undefined)));
  }

  setLastPlayerId(playerId: string): Observable<void> {
    return this.#localStorage
      .set('pgo.lastPlayerId', LAST_PLAYER_ID_VERSION, playerId)
      .pipe(map(() => undefined));
  }

  /**
   * Asks the browser to keep the data (TS §9.5); `true` if the storage is persistent. Browsers
   * may decide without asking the user, and some always answer `false`.
   */
  requestPersistence(): Observable<boolean> {
    return defer(() =>
      this.#persistence
        .persisted()
        .then((persisted) => persisted || this.#persistence.persist())
        .catch(() => false),
    );
  }

  /** A shareable seed such as `kupfer-falke-731` (TS §4.1). */
  suggestSeed(): string {
    return generateSeed(this.#random);
  }

  #db(): Promise<IDBPDatabase> {
    this.#database ??= openPortfoligoDb();
    return this.#database;
  }

  #openChannel(): MessageChannelPort {
    this.#channel ??= this.#createChannel();
    return this.#channel;
  }

  #broadcast(change: PlayerChange, playerId: string): void {
    const message: PlayersChangedMessage = { type: 'players-changed', change, playerId };
    this.#openChannel().postMessage(message);
  }
}
