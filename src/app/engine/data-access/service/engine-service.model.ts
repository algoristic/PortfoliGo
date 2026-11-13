import { AccountId, DepotId, OpenableAccountKind } from '@app/banking/domain/models/account.model';
import { BANK_COMMAND_ERRORS, ClosingPreview } from '@app/banking/domain/models/bank-command.model';
import { ClosedMonth } from '@app/banking/domain/models/household.model';
import { SpeedId } from '@app/clock/domain/models/speed.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { AccountView } from '@app/engine/domain/models/account-view.model';
import { BackgroundMode, StartConditions } from '@app/engine/domain/models/game-state.model';
import { JumpTarget } from '@app/engine/domain/models/jump-target.model';
import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
import { Cents } from '@app/shared/domain/models/money.model';
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
 * Queries (TS §8.2); they write nothing and don't hold the clock. `closingPreview` shows what
 * closing an account now would book (TS §7.4); `monthlyValues` the household months (US-EK-03).
 */
export type EngineQuery =
  | { kind: 'exchanges' }
  | { kind: 'banks' }
  | { kind: 'closingPreview'; accountId: AccountId }
  | { kind: 'monthlyValues' };
export type EngineQueryKind = EngineQuery['kind'];
export const ENGINE_QUERY_KINDS = [
  'exchanges',
  'banks',
  'closingPreview',
  'monthlyValues',
] as const satisfies readonly EngineQueryKind[];

/** Own transfer (US-BK-04): whole cents ≥ 1, purpose up to `MAX_PURPOSE_LENGTH` characters. */
export interface TransferPayload {
  fromAccountId: AccountId;
  toAccountId: AccountId;
  amount: Cents;
  purpose: string;
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
  subscribe: { series: number[] };
  unsubscribe: { series: number[] };
  query: { query: EngineQuery };
  setBackgroundMode: { mode: BackgroundMode };
  openAccount: { bankId: string; kind: OpenableAccountKind };
  /** `targetAccountId` receives the remainder after the settlement; required if one remains. */
  closeAccount: { accountId: AccountId; targetAccountId?: AccountId };
  setSalaryAccount: { accountId: AccountId };
  transfer: TransferPayload;
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

export type EngineQueryResult =
  | { kind: 'exchanges'; exchanges: ExchangeInfo[] }
  /** Banks of the world with their conditions (bank comparison, account cards). */
  | { kind: 'banks'; banks: Bank[] }
  | { kind: 'closingPreview'; preview: ClosingPreview }
  | ({ kind: 'monthlyValues' } & MonthlyValuesResult);

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
}

export interface QuotesPayload {
  tick: Tick;
  quotes: SeriesQuote[];
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
  projection: ProjectionPayload;
  progress: ProgressPayload;
  reply: ReplyPayload;
  warning: WarningPayload;
  fatal: FatalPayload;
}

export const ENGINE_EVENT_TYPES = [
  'clock',
  'quotes',
  'projection',
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
