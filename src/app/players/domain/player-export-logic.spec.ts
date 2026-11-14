import fc from 'fast-check';

import { Transaction } from '@app/banking/domain/models/ledger.model';
import { TICKS_PER_DAY, TICKS_PER_MINUTE } from '@app/clock/domain/models/time.model';
import { SCHEMA_VERSION, SIM_VERSION } from '@app/engine/domain/version';
import { marketChecksum } from '@app/market/domain/market-checksum';
import { advanceMarket, createMarketState } from '@app/market/domain/market-step';
import { miniMarket } from '@app/market/domain/testing/mini-market';
import { GameNotification } from '@app/notifications/domain/models/notification.model';
import { DailyPoint } from '@app/portfolio/domain/models/performance.model';

import { PlayerExportContent } from './models/player-export.model';
import {
  buildPlayerExport,
  decodePlayerExport,
  encodePlayerExport,
  exportFileName,
  PlayerExportInput,
} from './player-export-logic';
import {
  EXPORT_FIXTURE_SEED,
  EXPORT_FIXTURE_TICK,
  exportFixtureContent,
} from './testing/export-fixture';

// Export format (TS §10.1): content, file name, checksum, codec and the checks of the import
// (TS §10.3), on the short game of the export fixture.

const EPOCH_MS = Date.UTC(2020, 0, 1);
const MS_PER_TICK = 60_000 / TICKS_PER_MINUTE;

/** Tick of a game date and time, independent of the calendar functions (`Date.UTC`). */
function gameTick(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return (Date.UTC(year, month - 1, day, hour, minute) - EPOCH_MS) / MS_PER_TICK;
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Reference: canonical JSON by sorting the keys at every level (TS §10.1). */
function referenceCanonical(value: Json): string {
  if (Array.isArray(value)) {
    return `[${value.map(referenceCanonical).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${keys.map((key) => `${JSON.stringify(key)}:${referenceCanonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function referenceSha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Reference: the JSON of an export file, read with `atob` and `DecompressionStream`. */
async function readFile(text: string): Promise<{ [key: string]: Json }> {
  const bytes = Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text()) as { [key: string]: Json };
}

/** Reference: an export file of `json`, with a correct checksum unless `checksum` is given. */
async function writeFile(json: { [key: string]: Json }, checksum?: string): Promise<string> {
  const { checksum: _old, ...content } = json;
  const sum = checksum ?? `sha256:${await referenceSha256(referenceCanonical(content))}`;
  const stream = new Blob([JSON.stringify({ ...content, checksum: sum })])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return btoa(String.fromCharCode(...bytes));
}

/** Paths to the scalar leaves of a JSON value. */
function leaves(value: Json, path: Array<string | number> = []): Array<Array<string | number>> {
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) =>
      leaves(item, [...path, Array.isArray(value) ? Number(key) : key]),
    );
  }
  return [path];
}

function setAt(json: Json, path: ReadonlyArray<string | number>, item: Json): Json {
  const copy = structuredClone(json);
  let target = copy as Record<string | number, Json>;
  path.slice(0, -1).forEach((key) => (target = target[key] as Record<string | number, Json>));
  target[path[path.length - 1]] = item;
  return copy;
}

let content: PlayerExportContent;
let file: string;

beforeAll(async () => {
  content = exportFixtureContent();
  file = await encodePlayerExport(content);
});

describe('buildPlayerExport', () => {
  it('takes the market at 00:00 of the export day, as an uninterrupted run has it', () => {
    const { context } = miniMarket(EXPORT_FIXTURE_SEED);
    const reference = createMarketState(context);
    // Wednesday, 15.05.2030: day 3787 since the epoch.
    advanceMarket(context, reference, gameTick(2030, 5, 15) / TICKS_PER_DAY);
    expect(content.market.day).toBe(3787);
    expect(marketChecksum(content.market)).toBe(marketChecksum(reference));
    expect(content.marketChecksum).toBe(marketChecksum(reference));
  });

  it('fills the envelope, the profile and the clock', () => {
    expect(content).toMatchObject({
      format: 'portfoligo/player',
      formatVersion: 1,
      appVersion: '0.0.0-fixture',
      simVersion: SIM_VERSION,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: '2026-11-14T09:41:00.000Z',
      player: {
        name: 'Export Fixture',
        seed: 'mini-1',
        startConditions: { startCapital: 1_000_000, netIncome: 280_000, livingCosts: 170_000 },
      },
      clock: {
        tick: gameTick(2030, 5, 15, 14, 37),
        speed: '1h',
        paused: true,
        lastSeenAt: '2026-11-14T09:41:00.000Z',
      },
    });
    expect(content.state.tick).toBe(gameTick(2030, 5, 15, 14, 37));
    expect(content.state.player.backgroundMode).toBe('custom-speed');
  });

  it('keeps the whole journal and one daily point per day that ended', () => {
    const { player } = content.state;
    expect(content.transactions.map(({ seq }) => seq)).toEqual(
      Array.from({ length: player.nextTransactionSeq - 1 }, (_, i) => i + 1),
    );
    // 01.04. to 14.05.2030: 44 days.
    expect(content.series.performance.map(({ day }) => day)).toEqual(
      Array.from({ length: 44 }, (_, i) => gameTick(2030, 4, 1) / TICKS_PER_DAY + i),
    );
    expect(content.notifications.map(({ seq }) => seq)).toEqual(
      Array.from({ length: player.notifications.nextSeq - 1 }, (_, i) => i + 1),
    );
  });

  describe('with records after the export tick and records in two sources', () => {
    function input(): PlayerExportInput {
      const state = content.state;
      const tick = state.tick;
      const later = <T extends { seq: number; tick: number }>(record: T, seq: number): T => ({
        ...record,
        seq,
        tick: tick + 1,
      });
      const lastTransaction = content.transactions[content.transactions.length - 1];
      const lastNotification = content.notifications[content.notifications.length - 1];
      const lastPoint = content.series.performance[content.series.performance.length - 1];
      return {
        appVersion: '1.2.3',
        exportedAtMs: Date.UTC(2026, 0, 2, 3, 4, 5, 6),
        name: 'n',
        seed: 's',
        speed: '1d',
        paused: false,
        snapshot: { ...state, market: content.market, commandIds: ['u-1'] },
        market: content.market,
        transactions: [
          content.transactions,
          [
            { ...lastTransaction, purpose: 'unsaved' } as Transaction,
            later(lastTransaction, state.player.nextTransactionSeq),
          ],
        ],
        notifications: [
          [later(lastNotification, state.player.notifications.nextSeq)],
          content.notifications,
        ],
        points: [
          content.series.performance,
          [{ ...lastPoint, day: state.player.performance.day, tick: tick + 1 } as DailyPoint],
        ],
      };
    }

    it('leaves out the later ones and takes the record of the later source', () => {
      const built = buildPlayerExport(input());
      expect(built.transactions).toHaveLength(content.transactions.length);
      expect(built.transactions.at(-1)).toMatchObject({ purpose: 'unsaved' });
      expect(built.notifications).toEqual(content.notifications);
      expect(built.series.performance).toEqual(content.series.performance);
      expect(built.state.commandIds).toEqual(['u-1']);
      expect(built.exportedAt).toBe('2026-01-02T03:04:05.006Z');
    });

    it('leaves out notifications the player no longer keeps', () => {
      const base = input();
      const player = {
        ...content.state.player,
        notifications: { ...content.state.player.notifications, nextSeq: 1_002 },
      };
      const old: GameNotification = { ...content.notifications[0], seq: 1 };
      const kept: GameNotification = { ...content.notifications[0], seq: 2 };
      const built = buildPlayerExport({
        ...base,
        snapshot: { ...base.snapshot, player },
        notifications: [[old, kept]],
      });
      // The newest 1.000 numbers are kept: 2 … 1.001.
      expect(built.notifications.map(({ seq }) => seq)).toEqual([2]);
    });

    it('rejects a market of another day', () => {
      const base = input();
      expect(() =>
        buildPlayerExport({ ...base, market: { ...content.market, day: content.market.day + 1 } }),
      ).toThrow(RangeError);
    });
  });
});

describe('exportFileName', () => {
  // TS §10.1: file names.
  it.each([
    ['Mein Depot', gameTick(2031, 4, 15, 9, 30), 'Mein-Depot-2031-04-15.pgo'],
    ['Ölrausch / 2', gameTick(2030, 12, 31, 23, 59), 'Ölrausch-2-2030-12-31.pgo'],
    ['  ../a:b*c?  ', gameTick(2030, 4, 1), 'a-b-c-2030-04-01.pgo'],
    ['Börse_2030-neu', gameTick(2030, 4, 1), 'Börse_2030-neu-2030-04-01.pgo'],
    ['***', gameTick(2030, 4, 1), 'portfoligo-2030-04-01.pgo'],
    ['x'.repeat(39) + ' y', gameTick(2030, 4, 1), 'x'.repeat(39) + '-2030-04-01.pgo'],
    ['é'.repeat(45), gameTick(2030, 4, 1), 'é'.repeat(40) + '-2030-04-01.pgo'],
  ])('names %j at tick %d %j', (name, tick, expected) => {
    expect(exportFileName(name, tick)).toBe(expected);
  });
});

describe('encodePlayerExport', () => {
  it('writes base64 of gzip without line breaks, the fields in order and the checksum last', async () => {
    expect(file).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    const json = await readFile(file);
    expect(Object.keys(json)).toEqual([
      'format',
      'formatVersion',
      'appVersion',
      'simVersion',
      'schemaVersion',
      'exportedAt',
      'player',
      'clock',
      'state',
      'market',
      'marketChecksum',
      'transactions',
      'notifications',
      'series',
      'checksum',
    ]);
  });

  it('writes the SHA-256 of the canonical JSON without the checksum', async () => {
    const { checksum, ...rest } = await readFile(file);
    expect(checksum).toBe(`sha256:${await referenceSha256(referenceCanonical(rest))}`);
  });

  it('tags maps, typed arrays and NaN', async () => {
    const json = await readFile(file);
    expect(json['state']).toMatchObject({
      player: {
        balances: {
          $map: [
            ['acc-1', expect.any(Number)],
            ['acc-2', expect.any(Number)],
          ],
        },
      },
    });
    expect(json['market']).toMatchObject({
      logClose: { $f64: expect.any(Array) },
      nextExDay: { $i32: expect.any(Array) },
    });
  });
});

describe('decodePlayerExport', () => {
  it('reads back the content with its checksum', async () => {
    const decoded = await decodePlayerExport(file);
    const { checksum } = await readFile(file);
    expect(decoded).toEqual({ ok: true, export: { ...content, checksum } });
  });

  it('reads a file wrapped over lines', async () => {
    const wrapped = (file.match(/.{1,76}/g) ?? []).join('\r\n');
    expect((await decodePlayerExport(wrapped)).ok).toBe(true);
  });

  // TS §10.3: the checks in their order.
  it.each<[string, (json: { [key: string]: Json }) => Promise<string>, string]>([
    ['no base64', async () => 'kein Export!', 'invalid-encoding'],
    ['base64 but no gzip', async () => btoa('{"format":"portfoligo/player"}'), 'invalid-encoding'],
    ['gzip but no JSON', async () => gzipText('{'), 'invalid-format'],
    ['JSON but no object', async () => gzipText('[1]'), 'invalid-format'],
    ['another format', async (json) => writeFile({ ...json, format: 'other' }), 'invalid-format'],
    [
      'another format version',
      async (json) => writeFile({ ...json, formatVersion: 2 }),
      'unsupported-format-version',
    ],
    [
      'a changed field',
      async (json) => writeFile({ ...json, appVersion: '9.9.9' }, json['checksum'] as string),
      'checksum-mismatch',
    ],
    [
      'another algorithm',
      async (json) => writeFile(json, (json['checksum'] as string).replace('sha256:', 'sha512:')),
      'checksum-mismatch',
    ],
    [
      'another sim version',
      async (json) => writeFile({ ...json, simVersion: SIM_VERSION + 1 }),
      'sim-version-mismatch',
    ],
    [
      'another schema version',
      async (json) => writeFile({ ...json, schemaVersion: SCHEMA_VERSION + 1 }),
      'schema-version-mismatch',
    ],
    [
      'a malformed tag',
      async (json) => writeFile(setAt(json, ['market', 'logClose'], { $f64: 'x' }) as never),
      'invalid-structure',
    ],
    [
      'a missing field',
      async (json) => {
        const { series: _series, ...rest } = json;
        return writeFile(rest);
      },
      'invalid-structure',
    ],
    [
      'a clock of another tick',
      async (json) =>
        writeFile(
          setAt(json, ['clock', 'tick'], EXPORT_FIXTURE_TICK + 1) as { [key: string]: Json },
        ),
      'invalid-structure',
    ],
  ])('rejects %s', async (_label, make, error) => {
    const decoded = await decodePlayerExport(await make(await readFile(file)));
    expect(decoded).toEqual({ ok: false, error });
  });

  it('rejects every changed value as damaged', async () => {
    const json = await readFile(file);
    const paths = leaves(json).filter(([key]) => key !== 'checksum' && key !== 'format');
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...paths), fc.string(), async (path, item) => {
        const changed = setAt(json, path, `${item}~`) as { [key: string]: Json };
        const decoded = await decodePlayerExport(
          await writeFile(changed, json['checksum'] as string),
        );
        expect(decoded).toEqual({
          ok: false,
          error: path[0] === 'formatVersion' ? 'unsupported-format-version' : 'checksum-mismatch',
        });
      }),
      { numRuns: 25 },
    );
  });
});

async function gzipText(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return btoa(String.fromCharCode(...bytes));
}
