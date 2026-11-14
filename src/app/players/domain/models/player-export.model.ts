import { Transaction } from '@app/banking/domain/models/ledger.model';
import { SpeedId } from '@app/clock/domain/models/speed.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { PlayerState, StartConditions } from '@app/engine/domain/models/game-state.model';
import { SchedulerState } from '@app/engine/domain/models/scheduled-task.model';
import { MarketSnapshot } from '@app/market/domain/models/market-state.model';
import { GameNotification } from '@app/notifications/domain/models/notification.model';
import { DailyPoint } from '@app/portfolio/domain/models/performance.model';

/** `format` of an export file (TS §10.1). */
export const EXPORT_FORMAT = 'portfoligo/player';

/** Version of the export format (TS §10.1, §15); raise it on every change to the format. */
export const EXPORT_FORMAT_VERSION = 1;

/** Prefix of `checksum`: the algorithm, followed by 64 lowercase hex characters. */
export const EXPORT_CHECKSUM_PREFIX = 'sha256:';

/** File extension of an export file (TS §10.1). */
export const EXPORT_FILE_EXTENSION = '.pgo';

/**
 * Why an import file was rejected (TS §10.3), in the order of the checks: the text is no
 * base64/gzip/UTF-8 (`invalid-encoding`), no JSON or no PortfoliGo export (`invalid-format`), a newer
 * or older format (`unsupported-format-version`), damaged (`checksum-mismatch`), from another
 * simulation or state version (`sim-version-mismatch`, `schema-version-mismatch`), or its content
 * does not fit the format (`invalid-structure`).
 */
export const IMPORT_ERRORS = [
  'invalid-encoding',
  'invalid-format',
  'unsupported-format-version',
  'checksum-mismatch',
  'sim-version-mismatch',
  'schema-version-mismatch',
  'invalid-structure',
] as const;
export type ImportErrorCode = (typeof IMPORT_ERRORS)[number];

/** Profile data of the exported player (TS §9.1); the import gives it a new ID. */
export interface ExportedProfile {
  name: string;
  seed: string;
  startConditions: StartConditions;
}

/** Clock state at the export (TS §9.1 `runtime`); the import starts paused anyway (E-10). */
export interface ExportedClock {
  tick: Tick;
  speed: SpeedId;
  paused: boolean;
  /** Wall-clock time of the export as an ISO 8601 string in UTC. */
  lastSeenAt: string;
}

/**
 * The game state at the export tick without the market (TS §10.1): everything `GameEngine.restore`
 * needs besides the market, which follows from `market` by the day step of the export day.
 */
export interface ExportedGameState {
  tick: Tick;
  player: PlayerState;
  scheduler: SchedulerState;
  commandIds: string[];
}

/** Daily series by name (TS §9.1 `series`); since AP 5.7 only `performance`. */
export interface ExportedSeries {
  performance: DailyPoint[];
}

/**
 * Content of an export file, format version 1 (TS §10.1). In the file, maps, typed arrays and the
 * numbers JSON lacks are tagged (`persistence/util/tagged-json.ts`).
 */
export interface PlayerExport {
  format: typeof EXPORT_FORMAT;
  formatVersion: number;
  appVersion: string;
  simVersion: number;
  schemaVersion: number;
  /** Wall-clock time of the export as an ISO 8601 string in UTC. */
  exportedAt: string;
  player: ExportedProfile;
  clock: ExportedClock;
  state: ExportedGameState;
  /** Market state at 00:00 of the export day (`market.day` = day of `state.tick`). */
  market: MarketSnapshot;
  /** `marketChecksum` of `market` (32 hex characters, TS §4.6). */
  marketChecksum: string;
  /** The journal up to the export tick, by running number (TS §7.2). */
  transactions: Transaction[];
  /** The kept notifications up to the export tick, by running number (TS §9.1). */
  notifications: GameNotification[];
  series: ExportedSeries;
  /** `sha256:` and the SHA-256 of the canonical JSON of the file without this field. */
  checksum: string;
}

export type PlayerExportContent = Omit<PlayerExport, 'checksum'>;

/** Result of reading an export file (TS §10.3). */
export type DecodedPlayerExport =
  { ok: true; export: PlayerExport } | { ok: false; error: ImportErrorCode };
