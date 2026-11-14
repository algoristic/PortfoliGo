import { TICKS_PER_DAY } from '@app/clock/domain/models/time.model';
import { marketChecksum } from '@app/market/domain/market-checksum';
import { advanceMarket, createMarketState } from '@app/market/domain/market-step';
import { miniMarket } from '@app/market/domain/testing/mini-market';
import { FakePlayerLocks } from '@app/persistence/data-access/testing/fake-player-locks';
import { canonicalJson } from '@app/persistence/util/canonical-json';
import { sha256Hex } from '@app/persistence/util/sha256';
import { JsonValue } from '@app/persistence/util/tagged-json';
import { gunzipBase64, gzipBase64 } from '@app/persistence/util/text-codec';
import { EXPORT_V1_CONTENT } from '@app/players/domain/testing/export-v1';

import { CANDLE_FIELDS, candleSlot } from './daily-candles.utils';
import { IndexedDbEngineStorage } from './indexed-db-engine-storage';

import { ImportedPlayer, ProjectionPayload } from '../service/engine-service.model';
import { FaultyEngineStorage } from '../testing/faulty-engine-storage';
import {
  advance,
  FINE,
  gameTick,
  HostHarness,
  MINI_PLAYER,
  runUntil,
} from '../testing/host-harness';
import { generateMiniWorld } from '../testing/in-process-engine-worker';

// Import through the worker host (AP 6.1, TS §10.3) of the frozen export fixture of format version
// 1 (`players/domain/testing/export-fixture.ts`): mini world `mini-1`, watchlist with the first
// share, background mode `custom-speed` 1 d with a pause after 60 min, a depot at a broker with
// one share bought at the market and a waiting limit order, exported on Wednesday 15.05.2030 at
// 14:37 at speed 1 h.

const IMPORTED_ID = 'p-import';
const EXPORT_TICK = gameTick(2030, 5, 15, 14, 37);
const EXPORT_DAY = gameTick(2030, 5, 15) / TICKS_PER_DAY;
const { world } = generateMiniWorld(MINI_PLAYER.seed);
const SHARE = world.companies[0];

type JsonRecord = Record<string, JsonValue>;

/** The JSON of the fixture, read with the codec. */
async function fixtureJson(): Promise<JsonRecord> {
  return JSON.parse(await gunzipBase64(EXPORT_V1_CONTENT)) as JsonRecord;
}

/** A file with `change` applied to the JSON and, unless `keepChecksum`, a matching checksum. */
async function changedFile(
  change: (json: JsonRecord) => void,
  keepChecksum = false,
): Promise<string> {
  const json = await fixtureJson();
  change(json);
  if (!keepChecksum) {
    const { checksum: _checksum, ...content } = json;
    json['checksum'] = `sha256:${await sha256Hex(canonicalJson(content))}`;
  }
  return gzipBase64(JSON.stringify(json));
}

async function imported(harness: HostHarness, content: string): Promise<ImportedPlayer> {
  const reply = await harness.send('importPlayer', { content, playerId: IMPORTED_ID });
  if (!reply.ok) {
    throw new Error(`import failed: ${reply.error} ${reply.message ?? ''}`);
  }
  return reply.data as ImportedPlayer;
}

async function expectNothingStored(storage: IndexedDbEngineStorage): Promise<void> {
  expect(await storage.loadPlayerState(IMPORTED_ID)).toEqual({ monthStarts: [], commands: [] });
  expect(await storage.loadTransactions(IMPORTED_ID)).toEqual([]);
  expect(await storage.loadNotifications(IMPORTED_ID)).toEqual([]);
  expect(await storage.loadDailyPoints(IMPORTED_ID, 0, EXPORT_DAY)).toEqual([]);
}

function lastProjection(harness: HostHarness): ProjectionPayload {
  const projections = harness.events('projection');
  return projections[projections.length - 1].payload;
}

describe('EngineHost import', () => {
  it('imports the fixture of format version 1 paused, and loading does not catch up', async () => {
    const storage = new IndexedDbEngineStorage();
    const locks = new FakePlayerLocks();
    const harness = new HostHarness({ config: FINE }, { storage, locks });

    const player = await imported(harness, EXPORT_V1_CONTENT);
    expect(player).toMatchObject({
      playerId: IMPORTED_ID,
      name: 'Export Fixture',
      seed: 'mini-1',
      startConditions: MINI_PLAYER.start,
      appVersion: '0.0.0-fixture',
      exportedAt: '2026-11-14T09:41:00.000Z',
      tick: EXPORT_TICK,
      marketChecksumMatches: true,
    });
    expect(harness.progress.at(-1)).toEqual({
      kind: 'import',
      state: 'done',
      done: EXPORT_DAY,
      total: EXPORT_DAY,
    });
    expect(locks.held).toEqual([]);
    const stored = await storage.loadPlayerState(IMPORTED_ID);
    expect(stored.clock).toMatchObject({ tick: EXPORT_TICK, speed: '1h', paused: true });
    expect(stored.clock?.netWorth).toBe(player.netWorth);
    // Month starts from the epoch, the last one the exported market of the export day.
    expect(stored.monthStarts[0].day).toBe(0);
    expect(stored.monthStarts.at(-1)?.day).toBe(EXPORT_DAY);
    const { context } = miniMarket(MINI_PLAYER.seed);
    const reference = createMarketState(context);
    advanceMarket(context, reference, EXPORT_DAY);
    expect(marketChecksum(stored.monthStarts.at(-1) ?? reference)).toBe(marketChecksum(reference));

    // A day of real time later: paused, nothing caught up, the exported state.
    await advance(harness, 86_400_000);
    await harness.send('loadPlayer', { ...MINI_PLAYER, playerId: IMPORTED_ID });
    await advance(harness, 1_000);
    expect(harness.clock).toMatchObject({
      tick: EXPORT_TICK,
      paused: true,
      speed: '1h',
      backgroundMode: 'custom-speed',
      backgroundSpeed: '1d',
      backgroundPauseAfter: 60,
    });
    expect(harness.progress.some(({ kind }) => kind === 'catch-up')).toBe(false);
    const projection = lastProjection(harness);
    expect(projection.netWorth).toBe(player.netWorth);
    expect(projection.watchlist?.ids).toEqual([SHARE.id]);
    const trading = harness
      .events('projection')
      .map(({ payload }) => payload.trading)
      .find((part) => part !== undefined);
    expect(trading?.orders.filter(({ status }) => status === 'open')).toMatchObject([
      { instrumentId: SHARE.id, type: 'limit', limit: 0.01 },
    ]);
    expect(trading?.depots.flatMap(({ positions }) => positions)).toMatchObject([
      { instrumentId: SHARE.id, quantity: 1_000_000 },
    ]);

    // The game runs on from the imported market: the next day's closes come from the same run.
    await harness.send('jumpTo', { target: { kind: 'date', tick: EXPORT_TICK + TICKS_PER_DAY } });
    await runUntil(harness, () =>
      harness.progress.some(({ kind, state }) => kind === 'jump' && state === 'done'),
    );
    await advance(harness, 500);
    expect(harness.clock.tick).toBe(EXPORT_TICK + TICKS_PER_DAY);
    harness.host.dispose();
  });

  it('adds the candles before the export day in the background', async () => {
    const storage = new IndexedDbEngineStorage();
    const harness = new HostHarness(
      { config: FINE, candleBackfillFrom: gameTick(2030, 5, 6) },
      { storage },
    );
    await imported(harness, EXPORT_V1_CONTENT);
    await harness.send('loadPlayer', { ...MINI_PLAYER, playerId: IMPORTED_ID });
    await runUntil(harness, () =>
      harness.progress.some(({ kind, state }) => kind === 'candles' && state === 'done'),
    );
    await harness.send('unloadPlayer', {});
    const [bucket] = await storage.loadDailyCandles(IMPORTED_ID, SHARE.id, 2030, 2030);
    // Monday 06.05. to Tuesday 14.05.2030: seven market days with all four values.
    const days = [6, 7, 8, 9, 10, 13, 14].map((day) => gameTick(2030, 5, day) / TICKS_PER_DAY);
    for (const day of days) {
      const offset = candleSlot(day) * CANDLE_FIELDS;
      const [open, high, low, close] = bucket.values.slice(offset, offset + CANDLE_FIELDS);
      expect([open, high, low, close].every(Number.isFinite)).toBe(true);
      expect(high).toBeGreaterThanOrEqual(Math.max(open, close));
      expect(low).toBeLessThanOrEqual(Math.min(open, close));
    }
  });

  it.each<[string, () => Promise<string>, string]>([
    ['a cut file', async () => EXPORT_V1_CONTENT.slice(0, 200), 'invalid-encoding'],
    ['text that is no export', async () => gzipBase64('{"format":"other"}'), 'invalid-format'],
    [
      'another format version',
      () => changedFile((json) => (json['formatVersion'] = 2)),
      'unsupported-format-version',
    ],
    [
      'a changed amount',
      () =>
        changedFile((json) => {
          const start = (json['player'] as JsonRecord)['startConditions'] as JsonRecord;
          start['startCapital'] = 99;
        }, true),
      'checksum-mismatch',
    ],
    [
      'another simulation version',
      () => changedFile((json) => (json['simVersion'] = (json['simVersion'] as number) + 1)),
      'sim-version-mismatch',
    ],
    [
      'another schema version',
      () => changedFile((json) => (json['schemaVersion'] = (json['schemaVersion'] as number) + 1)),
      'schema-version-mismatch',
    ],
    [
      'a broken structure',
      () => changedFile((json) => ((json['state'] as JsonRecord)['tick'] = 'today')),
      'invalid-structure',
    ],
    [
      'a state the engine cannot restore',
      () =>
        changedFile((json) => {
          const player = (json['state'] as JsonRecord)['player'] as JsonRecord;
          const [position] = player['positions'] as JsonRecord[];
          position['instrumentId'] = 'stk-unknown';
        }),
      'invalid-structure',
    ],
  ])('rejects %s with its code and stores nothing', async (_name, file, code) => {
    const storage = new IndexedDbEngineStorage();
    const locks = new FakePlayerLocks();
    const harness = new HostHarness({}, { storage, locks });

    const reply = await harness.send('importPlayer', {
      content: await file(),
      playerId: IMPORTED_ID,
    });

    expect(reply).toMatchObject({ ok: false, error: code });
    expect(locks.held).toEqual([]);
    await expectNothingStored(storage);
  });

  it('stores nothing when the write fails', async () => {
    const inner = new IndexedDbEngineStorage();
    const storage = new FaultyEngineStorage(inner, { failAt: 1, mode: 'fail' });
    const harness = new HostHarness({}, { storage });

    const reply = await harness.send('importPlayer', {
      content: EXPORT_V1_CONTENT,
      playerId: IMPORTED_ID,
    });

    expect(reply).toMatchObject({ ok: false, error: 'storage-failed' });
    expect(harness.progress.at(-1)).toMatchObject({ kind: 'import', state: 'cancelled' });
    await expectNothingStored(inner);
  });

  it('refuses no ID, a player that exists and one another tab runs', async () => {
    const locks = new FakePlayerLocks();
    const harness = new HostHarness({}, { locks });
    expect(
      await harness.send('importPlayer', { content: EXPORT_V1_CONTENT, playerId: '' }),
    ).toMatchObject({ ok: false, error: 'invalid-command' });
    const otherTab = await locks.acquire(IMPORTED_ID);
    expect(
      await harness.send('importPlayer', { content: EXPORT_V1_CONTENT, playerId: IMPORTED_ID }),
    ).toMatchObject({ ok: false, error: 'player-locked' });
    otherTab?.release();

    await imported(harness, EXPORT_V1_CONTENT);
    expect(
      await harness.send('importPlayer', { content: EXPORT_V1_CONTENT, playerId: IMPORTED_ID }),
    ).toMatchObject({ ok: false, error: 'invalid-command' });
  });

  it('leaves a loaded player alone and does not load the imported one', async () => {
    const harness = new HostHarness({ config: FINE });
    await harness.send('loadPlayer', MINI_PLAYER);
    await harness.send('resume', {});
    await advance(harness, 1_000);
    const before = harness.clock.tick;

    await imported(harness, EXPORT_V1_CONTENT);
    await advance(harness, 1_000);

    expect(harness.clock.tick).toBeGreaterThan(before);
    expect(harness.clock.tick).toBeLessThan(EXPORT_TICK);
    expect(await harness.send('query', { query: { kind: 'banks' } })).toMatchObject({ ok: true });
    harness.host.dispose();
  });
});
