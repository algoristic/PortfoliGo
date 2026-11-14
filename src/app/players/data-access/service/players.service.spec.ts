import { TestBed } from '@angular/core/testing';
import { IDBPDatabase } from 'idb';
import { defer, firstValueFrom, throwError } from 'rxjs';
import type { Mocked } from 'vitest';

import { ImportedPlayer } from '@app/engine/data-access/service/engine-service.model';
import { EngineCommandError, EngineService } from '@app/engine/data-access/service/engine.service';
import { SCHEMA_VERSION, SIM_VERSION } from '@app/engine/domain/version';
import { STORE_NAMES, StoreName } from '@app/persistence/data-access/schema/idb-schema';
import { openPortfoligoDb } from '@app/persistence/data-access/schema/open-database';
import { FakePlayerLocks } from '@app/persistence/data-access/testing/fake-player-locks';
import { NewPlayer, PlayerProfile } from '@app/players/domain/models/player.model';

import { PlayersChangedMessage } from './players-service.model';
import { providePlayersService } from './players-service.providers';
import { isPlayersServiceError } from './players-service.utils';
import { PlayersService } from './players.service';

import {
  counterRandom,
  FakeBroadcastHub,
  FakeStoragePersistence,
  providePlayersTestPorts,
} from '../testing/fake-players-ports';

const NOW = Date.UTC(2026, 10, 13, 12);

const ANNA: NewPlayer = {
  name: ' Anna ',
  seed: 'Kupfer-Falke-731',
  start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
};

/** One record of a player in every store the worker owns, as the worker writes them. */
async function writeWorkerRecords(
  database: IDBPDatabase,
  playerId: string,
  versions = { simVersion: SIM_VERSION, schemaVersion: SCHEMA_VERSION },
): Promise<void> {
  const tick = 5_400_000;
  await database.put('runtime', {
    playerId,
    tick,
    speed: '1h',
    paused: true,
    lastSeenAt: NOW + 5_000,
  });
  await database.put('snapshots', { playerId, tick: tick - 10, ...versions, state: {} });
  await database.put('snapshots', { playerId, tick, ...versions, state: {} });
  await database.put('commands', { playerId, seq: 1, tick, command: {} });
  await database.put('marketStates', { playerId, day: 3_743, state: {} });
  await database.put('transactions', { playerId, seq: 1, tick, accountIds: ['a1'] });
  await database.put('orders', { playerId, orderId: 'o1', tick });
  await database.put('notifications', { playerId, seq: 1, tick });
  await database.put('candles', {
    playerId,
    instrumentId: 's1',
    resolution: '1d',
    bucket: 2030,
    values: new Float32Array(4),
  });
  await database.put('series', { playerId, name: 'net-worth', year: 2030, tick });
}

async function countRecords(database: IDBPDatabase, playerId: string): Promise<number[]> {
  const stores = STORE_NAMES.filter(
    (store): store is Exclude<StoreName, 'meta'> => store !== 'meta',
  );
  const counts: number[] = [];
  for (const store of stores) {
    const all = (await database.getAll(store)) as { id?: string; playerId?: string }[];
    counts.push(all.filter((record) => (record.playerId ?? record.id) === playerId).length);
  }
  return counts;
}

/** What the worker answers to an import of the export fixture (TS §10.3). */
function importedPlayer(playerId: string, start = ANNA.start): ImportedPlayer {
  return {
    playerId,
    name: 'Export Fixture',
    seed: 'mini-1',
    startConditions: start,
    simVersion: SIM_VERSION,
    schemaVersion: SCHEMA_VERSION,
    appVersion: '0.0.0-fixture',
    exportedAt: '2026-11-14T09:41:00.000Z',
    tick: 5_454_877,
    netWorth: 1_234_567,
    marketChecksumMatches: true,
  };
}

describe('PlayersService', () => {
  let service: PlayersService;
  let engine: Mocked<Pick<EngineService, 'importPlayer'>>;
  let locks: FakePlayerLocks;
  let hub: FakeBroadcastHub;
  let persistence: FakeStoragePersistence;
  let database: IDBPDatabase;

  beforeEach(async () => {
    localStorage.clear();
    locks = new FakePlayerLocks();
    hub = new FakeBroadcastHub();
    persistence = new FakeStoragePersistence();
    engine = { importPlayer: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        providePlayersService(),
        { provide: EngineService, useValue: engine },
        providePlayersTestPorts({
          locks,
          hub,
          persistence,
          clock: () => NOW,
          random: counterRandom(0xabc),
        }),
      ],
    });
    service = TestBed.inject(PlayersService);
    database = await openPortfoligoDb();
  });

  afterEach(() => {
    database.close();
    TestBed.resetTestingModule();
  });

  async function create(input: NewPlayer = ANNA): Promise<PlayerProfile> {
    return (await firstValueFrom(service.createPlayer(input))).profile;
  }

  describe('createPlayer', () => {
    it('stores the profile with a new ID, the normalised seed and the version', async () => {
      const created = await firstValueFrom(service.createPlayer(ANNA));

      expect(created.firstPlayer).toBe(true);
      expect(created.profile).toMatchObject({
        id: 'p-00000abc00000abd00000abe00000abf',
        name: 'Anna',
        seed: 'kupfer-falke-731',
        start: { startCapital: 1_000_000, netIncome: 250_000, livingCosts: 180_000 },
        simVersion: SIM_VERSION,
        createdAt: NOW,
      });
      expect(await database.getAll('players')).toEqual([created.profile]);
      expect(await database.count('runtime')).toBe(0);
    });

    it('reports only the first player as the first one', async () => {
      await create();
      const second = await firstValueFrom(service.createPlayer({ ...ANNA, name: 'Ben' }));

      expect(second.firstPlayer).toBe(false);
      expect(second.profile.id).not.toBe('p-00000abc00000abd00000abe00000abf');
      expect(await database.count('players')).toBe(2);
    });

    it('rejects invalid input without writing', async () => {
      await expect(firstValueFrom(service.createPlayer({ ...ANNA, name: '' }))).rejects.toThrow(
        /invalid input/,
      );
      expect(await database.count('players')).toBe(0);
      expect(hub.posted).toEqual([]);
    });

    it('tells the other tabs', async () => {
      const profile = await create();

      expect(hub.posted).toEqual([
        { type: 'players-changed', change: 'created', playerId: profile.id },
      ]);
    });
  });

  describe('importPlayer', () => {
    it('lets the worker write the game first, then creates the profile with the suffix', async () => {
      let profilesDuringImport = -1;
      engine.importPlayer.mockImplementation((_content, playerId) =>
        defer(async () => {
          profilesDuringImport = await database.count('players');
          await writeWorkerRecords(database, playerId);
          return importedPlayer(playerId);
        }),
      );

      const imported = await firstValueFrom(service.importPlayer('file', ' (Import)'));

      expect(engine.importPlayer).toHaveBeenCalledWith(
        'file',
        'p-00000abc00000abd00000abe00000abf',
      );
      expect(profilesDuringImport).toBe(0);
      expect(imported).toEqual({
        profile: {
          id: 'p-00000abc00000abd00000abe00000abf',
          name: 'Export Fixture (Import)',
          seed: 'mini-1',
          seedKey: expect.any(Array),
          start: ANNA.start,
          simVersion: SIM_VERSION,
          createdAt: NOW,
        },
        firstPlayer: true,
        tick: 5_454_877,
        marketChecksumMatches: true,
      });
      expect(await database.getAll('players')).toEqual([imported.profile]);
      expect(hub.posted).toEqual([
        { type: 'players-changed', change: 'created', playerId: imported.profile.id },
      ]);
      const [player] = await firstValueFrom(service.loadPlayers());
      expect(player).toMatchObject({ name: 'Export Fixture (Import)', tick: 5_400_000 });
    });

    it('creates no profile when the worker rejects the file', async () => {
      engine.importPlayer.mockReturnValue(
        throwError(() => new EngineCommandError('checksum-mismatch')),
      );

      const error = await firstValueFrom(service.importPlayer('file', ' (Import)')).catch(
        (failure: unknown) => failure,
      );

      expect(error).toBeInstanceOf(EngineCommandError);
      expect((error as EngineCommandError).code).toBe('checksum-mismatch');
      expect(await database.count('players')).toBe(0);
      expect(hub.posted).toEqual([]);
    });

    it('deletes what the worker wrote when the profile cannot be created', async () => {
      let playerId = '';
      engine.importPlayer.mockImplementation((_content, id) =>
        defer(async () => {
          playerId = id;
          await writeWorkerRecords(database, id);
          // Start conditions out of the ranges of PS US-SP-01: no valid profile.
          return importedPlayer(id, { ...ANNA.start, netIncome: 5_000_001 });
        }),
      );

      const error = await firstValueFrom(service.importPlayer('file', ' (Import)')).catch(
        (failure: unknown) => failure,
      );

      expect(error).toBeInstanceOf(Error);
      expect(playerId).not.toBe('');
      expect((await countRecords(database, playerId)).every((count) => count === 0)).toBe(true);
      expect(locks.held).toEqual([]);
      expect(hub.posted).toEqual([]);
    });
  });

  describe('renamePlayer', () => {
    it('changes only the name', async () => {
      const profile = await create();
      await writeWorkerRecords(database, profile.id);
      const runtimeBefore = await database.get('runtime', profile.id);

      const renamed = await firstValueFrom(service.renamePlayer(profile.id, '  Anna B.  '));

      expect(renamed).toEqual({ ...profile, name: 'Anna B.' });
      expect(await database.get('players', profile.id)).toEqual({ ...profile, name: 'Anna B.' });
      expect(await database.get('runtime', profile.id)).toEqual(runtimeBefore);
      expect(hub.posted).toContainEqual({
        type: 'players-changed',
        change: 'renamed',
        playerId: profile.id,
      });
    });

    it('rejects an invalid name and an unknown player', async () => {
      const profile = await create();

      const invalid = await firstValueFrom(service.renamePlayer(profile.id, '  ')).catch(
        (error: unknown) => error,
      );
      const unknown = await firstValueFrom(service.renamePlayer('p-unknown', 'Ben')).catch(
        (error: unknown) => error,
      );

      expect(isPlayersServiceError(invalid, 'invalid-input')).toBe(true);
      expect(isPlayersServiceError(unknown, 'player-not-found')).toBe(true);
      expect(await database.get('players', profile.id)).toEqual(profile);
      expect(await database.count('players')).toBe(1);
    });
  });

  describe('deletePlayer', () => {
    it('deletes all records of the player in every store and nothing of another', async () => {
      const anna = await create();
      const ben = await create({ ...ANNA, name: 'Ben' });
      await writeWorkerRecords(database, anna.id);
      await writeWorkerRecords(database, ben.id);
      const benBefore = await countRecords(database, ben.id);

      await firstValueFrom(service.deletePlayer(anna.id));

      expect(await countRecords(database, anna.id)).toEqual(benBefore.map(() => 0));
      expect(await countRecords(database, ben.id)).toEqual(benBefore);
      expect(benBefore.every((count) => count > 0)).toBe(true);
      expect(locks.held).toEqual([]);
      expect(hub.posted).toContainEqual({
        type: 'players-changed',
        change: 'deleted',
        playerId: anna.id,
      });
    });

    it('refuses to delete a player another tab runs', async () => {
      const profile = await create();
      await writeWorkerRecords(database, profile.id);
      const otherTab = await locks.acquire(profile.id);
      const before = await countRecords(database, profile.id);

      const error = await firstValueFrom(service.deletePlayer(profile.id)).catch(
        (failure: unknown) => failure,
      );

      expect(isPlayersServiceError(error, 'player-locked')).toBe(true);
      expect(await countRecords(database, profile.id)).toEqual(before);
      expect(
        hub.posted.filter((message) => (message as PlayersChangedMessage).change === 'deleted'),
      ).toEqual([]);

      otherTab?.release();
      await firstValueFrom(service.deletePlayer(profile.id));
      expect(await database.count('players')).toBe(0);
    });

    it('forgets the deleted player as the last used one, but not another', async () => {
      const anna = await create();
      const ben = await create({ ...ANNA, name: 'Ben' });
      await firstValueFrom(service.setLastPlayerId(ben.id));

      await firstValueFrom(service.deletePlayer(anna.id));
      expect(await firstValueFrom(service.getLastPlayerId())).toBe(ben.id);

      await firstValueFrom(service.deletePlayer(ben.id));
      expect(await firstValueFrom(service.getLastPlayerId())).toBeUndefined();
    });

    it('forgets the saved tick of the deleted player, but not of another', async () => {
      const anna = await create();
      const ben = await create({ ...ANNA, name: 'Ben' });
      localStorage.setItem(
        'pgo.lastTick',
        JSON.stringify({ v: 1, data: { [anna.id]: 5_389_921, [ben.id]: 5_389_950 } }),
      );

      await firstValueFrom(service.deletePlayer(anna.id));
      expect(JSON.parse(localStorage.getItem('pgo.lastTick') ?? 'null')).toEqual({
        v: 1,
        data: { [ben.id]: 5_389_950 },
      });
    });

    it('forgets the first steps of the deleted player, but not of another', async () => {
      const anna = await create();
      const ben = await create({ ...ANNA, name: 'Ben' });
      const settings = { hidden: true, banksVisited: false };
      localStorage.setItem(
        'pgo.ui.firstSteps',
        JSON.stringify({ v: 1, data: { [anna.id]: settings, [ben.id]: settings } }),
      );

      await firstValueFrom(service.deletePlayer(anna.id));
      expect(JSON.parse(localStorage.getItem('pgo.ui.firstSteps') ?? 'null')).toEqual({
        v: 1,
        data: { [ben.id]: settings },
      });
    });
  });

  describe('loadPlayers', () => {
    it('lists the players with game time and last use, most recently used first', async () => {
      const anna = await create();
      const ben = await create({ ...ANNA, name: 'Ben' });
      await writeWorkerRecords(database, anna.id);

      const players = await firstValueFrom(service.loadPlayers());

      expect(players).toEqual([
        {
          id: anna.id,
          name: 'Anna',
          seed: 'kupfer-falke-731',
          tick: 5_400_000,
          lastSeenAt: NOW + 5_000,
          createdAt: NOW,
          outdated: false,
        },
        {
          id: ben.id,
          name: 'Ben',
          seed: 'kupfer-falke-731',
          tick: null,
          lastSeenAt: null,
          createdAt: NOW,
          outdated: false,
        },
      ]);
    });

    // TS §9.1: the worker writes the net worth with the clock state from M3 on
    it('lists the net worth the worker stored with the clock', async () => {
      const anna = await create();
      await writeWorkerRecords(database, anna.id);
      const runtime = (await database.get('runtime', anna.id)) as object;
      await database.put('runtime', { ...runtime, netWorth: 1_234_567 });

      const [player] = await firstValueFrom(service.loadPlayers());

      expect(player).toMatchObject({ id: anna.id, tick: 5_400_000, netWorth: 1_234_567 });
    });

    it('marks players whose newest snapshot or profile has another version', async () => {
      const current = await create({ ...ANNA, name: 'Aktuell' });
      const oldSchema = await create({ ...ANNA, name: 'Altes Schema' });
      const oldSim = await create({ ...ANNA, name: 'Alte Simulation' });
      await writeWorkerRecords(database, current.id);
      await writeWorkerRecords(database, oldSchema.id, {
        simVersion: SIM_VERSION,
        schemaVersion: SCHEMA_VERSION + 1,
      });
      await database.put('players', { ...oldSim, simVersion: SIM_VERSION + 1 });

      const players = await firstValueFrom(service.loadPlayers());
      const outdated = Object.fromEntries(players.map(({ name, outdated }) => [name, outdated]));

      expect(outdated).toEqual({ Aktuell: false, 'Altes Schema': true, 'Alte Simulation': true });
    });

    it('lists nobody on a new device', async () => {
      expect(await firstValueFrom(service.loadPlayers())).toEqual([]);
    });
  });

  describe('changes$', () => {
    it('reports changes of other tabs and ignores other messages', async () => {
      const received: PlayersChangedMessage[] = [];
      const subscription = service.changes$.subscribe((message) => received.push(message));

      hub.postFromOtherTab({ type: 'players-changed', change: 'deleted', playerId: 'p-1' });
      hub.postFromOtherTab({ type: 'settings-changed' });
      hub.postFromOtherTab({ type: 'players-changed', change: 'exploded', playerId: 'p-1' });
      await create();
      await Promise.resolve();
      subscription.unsubscribe();

      expect(received).toEqual([{ type: 'players-changed', change: 'deleted', playerId: 'p-1' }]);
    });
  });

  describe('lastPlayerId', () => {
    it('remembers the last used player', async () => {
      expect(await firstValueFrom(service.getLastPlayerId())).toBeUndefined();
      await firstValueFrom(service.setLastPlayerId('p-1'));
      expect(await firstValueFrom(service.getLastPlayerId())).toBe('p-1');
    });

    it('ignores an entry that is no ID', async () => {
      localStorage.setItem('pgo.lastPlayerId', JSON.stringify({ v: 1, data: 42 }));
      expect(await firstValueFrom(service.getLastPlayerId())).toBeUndefined();
    });
  });

  describe('requestPersistence', () => {
    it('asks the browser once the storage is not yet persistent', async () => {
      expect(await firstValueFrom(service.requestPersistence())).toBe(true);
      expect(await firstValueFrom(service.requestPersistence())).toBe(true);
      expect(persistence.requests).toBe(1);
    });

    it('reports a refusal', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          providePlayersService(),
          { provide: EngineService, useValue: engine },
          providePlayersTestPorts({ persistence: new FakeStoragePersistence(false) }),
        ],
      });
      expect(await firstValueFrom(TestBed.inject(PlayersService).requestPersistence())).toBe(false);
    });
  });

  describe('suggestSeed', () => {
    it('suggests seeds of two words and a number', () => {
      expect(service.suggestSeed()).toMatch(/^[a-z]+-[a-z]+-[1-9]\d{2}$/);
    });
  });
});
