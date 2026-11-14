import { Transaction } from '@app/banking/domain/models/ledger.model';
import { dayIndex, tickToDateTime } from '@app/clock/domain/calendar-logic';
import { SpeedId } from '@app/clock/domain/models/speed.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { GameSnapshot } from '@app/engine/domain/models/game-state.model';
import { SCHEMA_VERSION, SIM_VERSION } from '@app/engine/domain/version';
import { marketChecksum } from '@app/market/domain/market-checksum';
import { MarketSnapshot } from '@app/market/domain/models/market-state.model';
import { GameNotification } from '@app/notifications/domain/models/notification.model';
import { oldestKeptSeq } from '@app/notifications/domain/read-state-logic';
import { canonicalJson } from '@app/persistence/util/canonical-json';
import { sha256Hex } from '@app/persistence/util/sha256';
import { fromTaggedJson, JsonValue, toTaggedJson } from '@app/persistence/util/tagged-json';
import { gunzipBase64, gzipBase64 } from '@app/persistence/util/text-codec';
import { DailyPoint } from '@app/portfolio/domain/models/performance.model';

import {
  DecodedPlayerExport,
  EXPORT_CHECKSUM_PREFIX,
  EXPORT_FILE_EXTENSION,
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  PlayerExportContent,
} from './models/player-export.model';
import { isPlayerExport } from './player-export.utils';

/** Longest name part of an export file name (TS §10.1). */
export const MAX_EXPORT_NAME_LENGTH = 40;

/** Name part when the player's name has no letter or digit left. */
const FALLBACK_NAME = 'portfoligo';

/** What the worker hands over for an export (TS §10.2). */
export interface PlayerExportInput {
  appVersion: string;
  /** Wall clock of the export in milliseconds since the Unix epoch. */
  exportedAtMs: number;
  name: string;
  seed: string;
  speed: SpeedId;
  paused: boolean;
  /** Game state at the export tick. */
  snapshot: GameSnapshot;
  /** Market state at 00:00 of the export day (`GameEngine.marketAtDayStart`). */
  market: MarketSnapshot;
  /**
   * Journal sources, e.g. the stored records and those not yet stored; a later source wins on the
   * same running number or day. Records after the export tick are left out.
   */
  transactions: ReadonlyArray<readonly Transaction[]>;
  notifications: ReadonlyArray<readonly GameNotification[]>;
  points: ReadonlyArray<readonly DailyPoint[]>;
}

/**
 * Content of the export file (TS §10.1) without the checksum: the state without its market, the
 * market at the start of the export day, and the journal up to the export tick (transactions below
 * `nextTransactionSeq`, the kept notifications up to the player's counter, the daily points of the
 * days that ended).
 */
export function buildPlayerExport(input: PlayerExportInput): PlayerExportContent {
  const { snapshot, market } = input;
  const { player } = snapshot;
  if (market.day !== dayIndex(snapshot.tick)) {
    throw new RangeError('buildPlayerExport: the market is not the one of the export day');
  }
  const lastSeq = player.notifications.nextSeq - 1;
  const firstSeq = oldestKeptSeq(lastSeq);
  const firstDay = dayIndex(player.performance.startTick);
  const lastDay = player.performance.day - 1;
  const exportedAt = new Date(input.exportedAtMs).toISOString();
  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    appVersion: input.appVersion,
    simVersion: SIM_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    player: { name: input.name, seed: input.seed, startConditions: { ...player.start } },
    clock: {
      tick: snapshot.tick,
      speed: input.speed,
      paused: input.paused,
      lastSeenAt: exportedAt,
    },
    state: {
      tick: snapshot.tick,
      player,
      scheduler: snapshot.scheduler,
      commandIds: snapshot.commandIds.slice(),
    },
    market,
    marketChecksum: marketChecksum(market),
    transactions: mergeBy(input.transactions, ({ seq }) => seq).filter(
      ({ seq }) => seq < player.nextTransactionSeq,
    ),
    notifications: mergeBy(input.notifications, ({ seq }) => seq).filter(
      ({ seq }) => seq >= firstSeq && seq <= lastSeq,
    ),
    series: {
      performance: mergeBy(input.points, ({ day }) => day).filter(
        ({ day }) => day >= firstDay && day <= lastDay,
      ),
    },
  };
}

/**
 * File name `<name>-<game date>.pgo` (TS §10.1): every run of characters other than letters,
 * digits, `_` and `-` becomes one `-`, without `-` at the ends, at most
 * `MAX_EXPORT_NAME_LENGTH` characters; `portfoligo` if nothing is left.
 */
export function exportFileName(name: string, tick: Tick): string {
  const safe = Array.from(
    name
      .normalize('NFC')
      .replace(/[^\p{L}\p{N}_-]+/gu, '-')
      .replace(/^-+|-+$/g, ''),
  )
    .slice(0, MAX_EXPORT_NAME_LENGTH)
    .join('')
    .replace(/-+$/, '');
  const { year, month, day } = tickToDateTime(tick);
  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return `${safe === '' ? FALLBACK_NAME : safe}-${date}${EXPORT_FILE_EXTENSION}`;
}

/** `sha256:` and the SHA-256 of the canonical JSON of the tagged content without `checksum`. */
export async function exportChecksum(tagged: Readonly<Record<string, JsonValue>>): Promise<string> {
  const { checksum: _checksum, ...content } = tagged;
  return EXPORT_CHECKSUM_PREFIX + (await sha256Hex(canonicalJson(content)));
}

/**
 * The text of an export file (TS §10.1): the tagged JSON in the fields' order of
 * `buildPlayerExport` with `checksum` last, as base64(gzip(UTF-8)).
 */
export async function encodePlayerExport(content: PlayerExportContent): Promise<string> {
  const tagged = toTaggedJson(content) as Record<string, JsonValue>;
  const checksum = await exportChecksum(tagged);
  return gzipBase64(JSON.stringify({ ...tagged, checksum }));
}

/**
 * Reads an export file (TS §10.3), checking in this order: encoding, JSON and `format`,
 * `formatVersion`, `checksum`, `simVersion`, `schemaVersion`, structure (`isPlayerExport`).
 */
export async function decodePlayerExport(text: string): Promise<DecodedPlayerExport> {
  let json: string;
  try {
    json = await gunzipBase64(text);
  } catch {
    return { ok: false, error: 'invalid-encoding' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'invalid-format' };
  }
  if (!isRecord(parsed) || parsed['format'] !== EXPORT_FORMAT) {
    return { ok: false, error: 'invalid-format' };
  }
  if (parsed['formatVersion'] !== EXPORT_FORMAT_VERSION) {
    return { ok: false, error: 'unsupported-format-version' };
  }
  if (parsed['checksum'] !== (await exportChecksum(parsed as Record<string, JsonValue>))) {
    return { ok: false, error: 'checksum-mismatch' };
  }
  if (parsed['simVersion'] !== SIM_VERSION) {
    return { ok: false, error: 'sim-version-mismatch' };
  }
  if (parsed['schemaVersion'] !== SCHEMA_VERSION) {
    return { ok: false, error: 'schema-version-mismatch' };
  }
  let revived: unknown;
  try {
    revived = fromTaggedJson(parsed);
  } catch {
    return { ok: false, error: 'invalid-structure' };
  }
  return isPlayerExport(revived)
    ? { ok: true, export: revived }
    : { ok: false, error: 'invalid-structure' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Records of all sources by key, ascending; a later source wins on the same key. */
function mergeBy<T>(sources: ReadonlyArray<readonly T[]>, key: (record: T) => number): T[] {
  const byKey = new Map<number, T>();
  for (const source of sources) {
    for (const record of source) {
      byKey.set(key(record), record);
    }
  }
  return [...byKey.entries()].sort(([a], [b]) => a - b).map(([, record]) => record);
}
