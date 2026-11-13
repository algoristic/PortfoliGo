import { AccountId, DepotId, OpenableAccountKind } from '@app/banking/domain/models/account.model';
import { BANK_COMMAND_ERRORS, ClosingPreview } from '@app/banking/domain/models/bank-command.model';
import { ClosedMonth } from '@app/banking/domain/models/household.model';
import { TransactionType } from '@app/banking/domain/models/ledger.model';
import { StatementEntry } from '@app/banking/domain/models/statement.model';
import { SpeedId } from '@app/clock/domain/models/speed.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { AccountView } from '@app/engine/domain/models/account-view.model';
import { BackgroundMode, StartConditions } from '@app/engine/domain/models/game-state.model';
import { JumpTarget } from '@app/engine/domain/models/jump-target.model';
import { MarketMovers } from '@app/engine/domain/models/market-movers.model';
import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import { Candle, CandleResolution } from '@app/market/domain/models/candle.model';
import {
  IndexComposition,
  InstrumentDividends,
  InstrumentFigures,
} from '@app/market/domain/models/instrument-figures.model';
import { Instrument, InstrumentDetails } from '@app/market/domain/models/instrument.model';
import { ScreenerCriteria, ScreenerRow } from '@app/market/domain/models/screener.model';
import { WATCHLIST_COMMAND_ERRORS } from '@app/market/domain/models/watchlist.model';
import { AbsenceReport } from '@app/notifications/domain/models/absence-report.model';
import {
  AutoPauseCode,
  GameNotification,
  NOTIFICATION_COMMAND_ERRORS,
  NotificationCategory,
  NotificationEntry,
} from '@app/notifications/domain/models/notification.model';
import { Cents } from '@app/shared/domain/models/money.model';
import { ORDER_COMMAND_ERRORS } from '@app/trading/domain/models/order.model';
import { Bank } from '@app/world/domain/models/bank.model';
import { RegionId } from '@app/world/domain/models/taxonomy.model';

/** Version of the message protocol between UI and worker (TS §8.3). */
export const ENGINE_PROTOCOL = 1;

/** Envelope of every message in both directions (TS §8.3). */
export interface EngineMessage<TType extends string, TPayload> {
  protocol: typeof ENGINE_PROTOCOL;
  /** Unique message ID. */
  id: string;
  /** In replies: the ID of the command. */
  replyTo?: string;
  type: TType;
  payload: TPayload;
}

export type EmptyPayload = Record<string, never>;

/**
 * Loads a player and starts the clock (TS §9.2). The worker reads the stored state; `seed` and
 * `start` come from the profile and are only used for a new player (no snapshot yet).
 */
export interface LoadPlayerPayload {
  playerId: string;
  seed: string;
  start: StartConditions;
  /**
   * Tick of the last `clock` event the UI saw, from localStorage (E-08): the restore replays at
   * least up to it (TS §9.2, step 3), because the clock in the database may be older.
   */
  minTick?: Tick;
}

/**
 * One page of an account's statement (TS §7.2, §8.2, US-BK-06), newest first. Ticks are
 * inclusive; `types` missing or empty means all; `search` looks at the purpose, bank names, numbers
 * of own counter accounts and amounts. `limit` is at most `MAX_STATEMENT_LIMIT`.
 */
export interface StatementQuery {
  kind: 'statement';
  accountId: AccountId;
  from?: Tick;
  to?: Tick;
  types?: TransactionType[];
  search?: string;
  offset: number;
  limit: number;
}

/** A statement query without its kind, as `EngineService.statement` takes it. */
export type StatementRequest = Omit<StatementQuery, 'kind'>;

/**
 * One page of the notification centre (US-BN-01, TS §8.2), newest first, optionally of one
 * category. `limit` is at most `MAX_NOTIFICATION_LIMIT`.
 */
export interface NotificationsQuery {
  kind: 'notifications';
  category?: NotificationCategory;
  offset: number;
  limit: number;
}

export type NotificationsRequest = Omit<NotificationsQuery, 'kind'>;

/** The screener (TS §8.2, US-MK-02): search, filters and sorting over all series. */
export interface ScreenerQuery extends ScreenerCriteria {
  kind: 'screener';
}

/** Longest search text of the screener; longer ones are `invalid-command`. */
export const MAX_SCREENER_SEARCH_LENGTH = 100;

/**
 * Candles of a series for a chart (TS §8.2, US-CH-01): the newest `limit` candles (default and at
 * most `MAX_CANDLE_LIMIT`, intraday at most `MAX_INTRADAY_DAYS` market days) whose start lies in
 * `[from, to]`; `to` defaults to the current tick and never goes beyond it, `from` to the epoch.
 * Older blocks for scrolling: `to` = start of the oldest loaded candle − 1.
 */
export interface CandlesQuery {
  kind: 'candles';
  series: number;
  interval: CandleResolution;
  from?: Tick;
  to?: Tick;
  limit?: number;
}

export type CandlesRequest = Omit<CandlesQuery, 'kind'>;

/**
 * Queries (TS §8.2); they write nothing and don't hold the clock. `closingPreview` shows what
 * closing an account now would book (TS §7.4); `monthlyValues` the household months (US-EK-03).
 */
export type EngineQuery =
  | { kind: 'exchanges' }
  | { kind: 'banks' }
  | { kind: 'closingPreview'; accountId: AccountId }
  | { kind: 'monthlyValues' }
  | StatementQuery
  | NotificationsQuery
  /** The last absence report since loading the player (US-BN-03), `null` without one. */
  | { kind: 'absenceReport' }
  /** Master data of all series (AP 4.1); it doesn't change during a game. */
  | { kind: 'instruments' }
  | { kind: 'instrumentDetails'; id: string }
  /** Key figures, dividends and the index composition of a series (AP 4.5, US-MK-03). */
  | { kind: 'instrumentFigures'; id: string }
  | { kind: 'instrumentDividends'; id: string }
  | { kind: 'instrumentComposition'; id: string }
  | ScreenerQuery
  | CandlesQuery;
export type EngineQueryKind = EngineQuery['kind'];
export const ENGINE_QUERY_KINDS = [
  'exchanges',
  'banks',
  'closingPreview',
  'monthlyValues',
  'statement',
  'notifications',
  'absenceReport',
  'instruments',
  'instrumentDetails',
  'instrumentFigures',
  'instrumentDividends',
  'instrumentComposition',
  'screener',
  'candles',
] as const satisfies readonly EngineQueryKind[];

/** Own transfer (US-BK-04): whole cents ≥ 1, purpose up to `MAX_PURPOSE_LENGTH` characters. */
export interface TransferPayload {
  fromAccountId: AccountId;
  toAccountId: AccountId;
  amount: Cents;
  purpose: string;
}

/** A chart whose newest candle the worker sends as `candle` events (TS §8.4). */
export interface ChartSubscription {
  series: number;
  interval: CandleResolution;
}

/**
 * Subscriptions (TS §8.4): series for `quotes`, optionally the topic `movers` and charts for
 * `candle`.
 */
export interface SubscriptionPayload {
  series: number[];
  movers?: boolean;
  charts?: ChartSubscription[];
}

/** Commands UI → worker (TS §8.2). */
export interface EngineCommandPayloads {
  loadPlayer: LoadPlayerPayload;
  unloadPlayer: EmptyPayload;
  setSpeed: { speed: SpeedId };
  pause: EmptyPayload;
  resume: EmptyPayload;
  setVisibility: { visible: boolean };
  jumpTo: { target: JumpTarget };
  cancelJump: EmptyPayload;
  /** Quotes of `series`; `movers: true` adds the `movers` event, `charts` `candle` events (TS §8.4). */
  subscribe: SubscriptionPayload;
  unsubscribe: SubscriptionPayload;
  query: { query: EngineQuery };
  setBackgroundMode: { mode: BackgroundMode };
  openAccount: { bankId: string; kind: OpenableAccountKind };
  /** `targetAccountId` receives the remainder after the settlement; required if one remains. */
  closeAccount: { accountId: AccountId; targetAccountId?: AccountId };
  setSalaryAccount: { accountId: AccountId };
  transfer: TransferPayload;
  setAutoPause: { code: AutoPauseCode; enabled: boolean };
  /**
   * Marks notifications as read: all up to `upTo` (the newest the UI knows, `lastSeq` of the
   * projection, for "all read") and the single ones in `seqs`; at least one of them.
   */
  markNotificationsRead: { upTo?: number; seqs?: number[] };
  /**
   * The complete new watchlist in its order (US-MK-04): adds, removes and reorders with one
   * command; at most `MAX_WATCHLIST_LENGTH` instruments of the world, none twice.
   */
  updateWatchlist: { ids: string[] };
}

export const ENGINE_COMMAND_TYPES = [
  'loadPlayer',
  'unloadPlayer',
  'setSpeed',
  'pause',
  'resume',
  'setVisibility',
  'jumpTo',
  'cancelJump',
  'subscribe',
  'unsubscribe',
  'query',
  'setBackgroundMode',
  'openAccount',
  'closeAccount',
  'setSalaryAccount',
  'transfer',
  'setAutoPause',
  'markNotificationsRead',
  'updateWatchlist',
] as const satisfies readonly (keyof EngineCommandPayloads)[];
export type EngineCommandType = (typeof ENGINE_COMMAND_TYPES)[number];

export type EngineCommandMessage = {
  [K in EngineCommandType]: EngineMessage<K, EngineCommandPayloads[K]>;
}[EngineCommandType];

export interface LoadedPlayer {
  playerId: string;
  tick: Tick;
}

export interface ExchangeInfo {
  id: string;
  name: string;
  regionId: RegionId;
  /** Trading hours as minutes of the game day. */
  open: number;
  close: number;
}

/** The household months: the closed ones oldest first, and the running month so far. */
export interface MonthlyValuesResult {
  closedMonths: ClosedMonth[];
  current: ClosedMonth;
}

/**
 * A statement page: the matches up to `tick` (the query limit, TS §8.2), `total` of them, and the
 * entries of the page.
 */
export interface StatementResult {
  total: number;
  entries: StatementEntry[];
  tick: Tick;
}

/**
 * A page of notifications up to `tick` (the query limit): `total` matches among the kept ones, the
 * entries with their read state.
 */
export interface NotificationsResult {
  total: number;
  entries: NotificationEntry[];
  tick: Tick;
}

/**
 * The screener's matches up to `tick` (the query limit): all of them, sorted, `total` their number.
 */
export interface ScreenerResult {
  total: number;
  rows: ScreenerRow[];
  tick: Tick;
}

export type EngineQueryResult =
  | { kind: 'exchanges'; exchanges: ExchangeInfo[] }
  /** Banks of the world with their conditions (bank comparison, account cards). */
  | { kind: 'banks'; banks: Bank[] }
  | { kind: 'closingPreview'; preview: ClosingPreview }
  | ({ kind: 'monthlyValues' } & MonthlyValuesResult)
  | ({ kind: 'statement' } & StatementResult)
  | ({ kind: 'notifications' } & NotificationsResult)
  | { kind: 'absenceReport'; report: AbsenceReport | null }
  | { kind: 'instruments'; instruments: Instrument[] }
  | { kind: 'instrumentDetails'; details: InstrumentDetails }
  | { kind: 'instrumentFigures'; figures: InstrumentFigures; tick: Tick }
  | ({ kind: 'instrumentDividends'; tick: Tick } & InstrumentDividends)
  /** `composition` is `null` for shares. */
  | { kind: 'instrumentComposition'; composition: IndexComposition | null; tick: Tick }
  | ({ kind: 'screener' } & ScreenerResult)
  | ({ kind: 'candles' } & CandlesResult);

/** The result of a query of kind `K`. */
export type EngineQueryResultOf<K extends EngineQueryKind> = Extract<
  EngineQueryResult,
  { kind: K }
>;

/** Reply to a game command: the tick after which it took effect. */
export interface GameCommandReply {
  tick: Tick;
}

/** Reply to `openAccount`: the new account; for a depot, its clearing account and the depot. */
export interface OpenedAccountReply extends GameCommandReply {
  accountId: AccountId;
  depotId: DepotId | null;
}

/**
 * A block of candles up to `tick` (the query limit), ascending; `hasOlder` is `false` once the
 * block reaches the first candle since the epoch.
 */
export interface CandlesResult {
  series: number;
  interval: CandleResolution;
  candles: Candle[];
  hasOlder: boolean;
  tick: Tick;
}

/** Data of a successful reply per command. */
export interface EngineReplies {
  loadPlayer: LoadedPlayer;
  unloadPlayer: null;
  setSpeed: null;
  pause: null;
  resume: null;
  setVisibility: null;
  jumpTo: { targetTick: Tick };
  cancelJump: null;
  subscribe: null;
  unsubscribe: null;
  query: EngineQueryResult;
  setBackgroundMode: GameCommandReply;
  openAccount: OpenedAccountReply;
  closeAccount: GameCommandReply;
  setSalaryAccount: GameCommandReply;
  transfer: GameCommandReply;
  setAutoPause: GameCommandReply;
  markNotificationsRead: GameCommandReply;
  updateWatchlist: GameCommandReply;
}

/** Error codes of replies (TS §8.3); the UI turns them into texts. */
export const ENGINE_ERRORS = [
  /** Envelope or type unknown. */
  'invalid-message',
  /** Payload invalid, or a game command the engine cannot read. */
  'invalid-command',
  'player-not-loaded',
  /** A jump runs; only `cancelJump`, `unloadPlayer`, `setVisibility`, queries and subscriptions pass. */
  'busy',
  'tick-mismatch',
  'invalid-jump-target',
  /**
   * A write failed: the write-ahead of a game command (the command was not applied, TS §8.5), or
   * reading or writing the state while loading or unloading a player.
   */
  'storage-failed',
  /** Another tab simulates the player (Web Lock, TS §9.4). */
  'player-locked',
  /** The stored game has another `simVersion` or `schemaVersion` (TS §15); it is not loaded. */
  'player-outdated',
  'internal-error',
  /** The engine rejected a bank command or query (TS §7.4); see `BANK_COMMAND_ERRORS`. */
  ...BANK_COMMAND_ERRORS,
  /** The engine rejected a notification command (TS §8.2); see `NOTIFICATION_COMMAND_ERRORS`. */
  ...NOTIFICATION_COMMAND_ERRORS,
  /**
   * The engine rejected `updateWatchlist` (TS §8.2); see `WATCHLIST_COMMAND_ERRORS`.
   * `unknown-instrument` also answers `instrumentDetails`, `instrumentFigures`,
   * `instrumentDividends` and `instrumentComposition` with an ID, or `candles` with a series, that
   * is no series of the world.
   */
  ...WATCHLIST_COMMAND_ERRORS,
  /** The engine rejected an order command (TS §7.5); see `ORDER_COMMAND_ERRORS`. */
  ...ORDER_COMMAND_ERRORS,
] as const;
export type EngineErrorCode = (typeof ENGINE_ERRORS)[number];

export type ReplyPayload =
  { ok: true; data: unknown } | { ok: false; error: EngineErrorCode; message?: string };

export interface ClockPayload {
  /** Last processed tick. */
  tick: Tick;
  speed: SpeedId;
  paused: boolean;
  visible: boolean;
  backgroundMode: BackgroundMode;
  /** Speed at which the game runs now, `null` while it rests (TS §3.6). */
  effectiveSpeed: SpeedId | null;
  /** Backlog above two seconds of real time (TS §3.5). */
  overloaded: boolean;
  jumping: boolean;
  /**
   * While the game rests because of an auto-pause (TS §3.6, §12): the notification that paused it.
   * Missing otherwise; `resume` clears it.
   */
  autoPause?: AutoPauseCause;
}

/** The notification an auto-pause stopped at. */
export interface AutoPauseCause {
  seq: number;
  code: AutoPauseCode;
}

export interface QuotesPayload {
  tick: Tick;
  quotes: SeriesQuote[];
}

/** Gainers, losers and sector indices of the day (TS §8.3), while `movers` is subscribed. */
export interface MoversPayload extends MarketMovers {
  tick: Tick;
}

/**
 * The newest candle of a subscribed chart (TS §8.3, §8.4) when it changed: the running one, and
 * `previous`, the finished candle right before it, when a new candle began since the last event of
 * the chart. If `previous.tick` is not the newest candle the chart holds, it skipped candles (a
 * jump, high speed) and loads its block again.
 */
export interface CandlePayload {
  tick: Tick;
  series: number;
  interval: CandleResolution;
  candle: Candle;
  previous?: Candle;
}

/**
 * `init`: loading and replay; `catch-up`, `jump`: batch runs in ticks; `candles`: background job
 * for daily candles in market days (TS §6.8).
 */
export const PROGRESS_KINDS = ['init', 'catch-up', 'jump', 'candles'] as const;
export type ProgressKind = (typeof PROGRESS_KINDS)[number];
export const PROGRESS_STATES = ['running', 'done', 'cancelled'] as const;
export type ProgressState = (typeof PROGRESS_STATES)[number];

/** Progress of initialisation, catching up, jumps and the candle job; `done` and `total` in steps. */
export interface ProgressPayload {
  kind: ProgressKind;
  state: ProgressState;
  done: number;
  total: number;
}

/**
 * Changed projections (TS §8.3, §8.4): only the accounts that changed, with the net worth. `full`
 * after loading a player: `accounts` holds all of them and replaces what the UI had.
 */
export interface ProjectionPayload {
  tick: Tick;
  full: boolean;
  accounts: AccountView[];
  /** Sum of the account balances in M3 (TS §7.9). */
  netWorth: Cents;
  /** With `full` and whenever counter, unread number or auto-pause settings changed (AP 3.6). */
  notifications?: NotificationsProjection;
  /** With `full` and whenever the watchlist changed (AP 4.4). */
  watchlist?: WatchlistProjection;
}

/** The player's watchlist (US-MK-04, TS §8.3). */
export interface WatchlistProjection {
  /** Instrument IDs in the player's order. */
  ids: string[];
}

/** Counter of the header and switches of the settings page (TS §8.3, §12). */
export interface NotificationsProjection {
  /** Running number of the newest notification, 0 without one. */
  lastSeq: number;
  /** Unread among the kept notifications. */
  unread: number;
  /** Effective auto-pause of every code that has one (TS §12). */
  autoPause: Record<AutoPauseCode, boolean>;
}

/**
 * New notifications (TS §8.3), oldest first: at once after a command, else bundled at most
 * `notificationPerSecond` times per second. Not sent while catching up: those go into the report.
 */
export interface NotificationPayload {
  tick: Tick;
  notifications: GameNotification[];
}

export interface FatalPayload {
  message: string;
}

/** Problems the engine survives; the UI may show them (TS §9.5). */
export const ENGINE_WARNINGS = [
  /**
   * A periodic write (clock, snapshot, month starts, daily candles) failed. The game goes on in
   * memory and the next periodic write tries again; until one succeeds, a restore loses the game
   * time since the last successful write, never a command (write-ahead). Sent once per series of
   * failures.
   */
  'storage-failed',
] as const;
export type EngineWarningCode = (typeof ENGINE_WARNINGS)[number];

export interface WarningPayload {
  code: EngineWarningCode;
  message: string;
}

/** Events worker → UI (TS §8.3). */
export interface EngineEventPayloads {
  clock: ClockPayload;
  quotes: QuotesPayload;
  movers: MoversPayload;
  candle: CandlePayload;
  projection: ProjectionPayload;
  notification: NotificationPayload;
  /** Absence report after a catch-up or a hidden period (US-BN-03). */
  report: AbsenceReport;
  progress: ProgressPayload;
  reply: ReplyPayload;
  warning: WarningPayload;
  fatal: FatalPayload;
}

export const ENGINE_EVENT_TYPES = [
  'clock',
  'quotes',
  'movers',
  'candle',
  'projection',
  'notification',
  'report',
  'progress',
  'reply',
  'warning',
  'fatal',
] as const satisfies readonly (keyof EngineEventPayloads)[];
export type EngineEventType = (typeof ENGINE_EVENT_TYPES)[number];

export type EngineEventMessage = {
  [K in EngineEventType]: EngineMessage<K, EngineEventPayloads[K]>;
}[EngineEventType];

/** The part of `Worker` the service uses; tests pass the in-process worker. */
export interface EngineWorkerPort {
  postMessage(message: EngineCommandMessage): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  addEventListener(type: 'error' | 'messageerror', listener: (event: Event) => void): void;
  terminate(): void;
}
