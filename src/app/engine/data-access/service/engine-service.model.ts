import { SpeedId } from '@app/clock/domain/models/speed.model';
import { Tick } from '@app/clock/domain/models/time.model';
import { BackgroundMode, StartConditions } from '@app/engine/domain/models/game-state.model';
import { JumpTarget } from '@app/engine/domain/models/jump-target.model';
import { SeriesQuote } from '@app/engine/domain/models/series-quote.model';
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
 * Loads a player and starts the clock. In M2 the UI passes the player data; from AP 2.3 the worker
 * reads the stored state, and further fields (e.g. the tick of the last `clock` event as a lower
 * bound, TS §9.2) are added here.
 */
export interface LoadPlayerPayload {
  playerId: string;
  seed: string;
  start: StartConditions;
}

/** Queries (TS §8.2); they write nothing and don't hold the clock. M2 knows only the exchanges. */
export type EngineQuery = { kind: 'exchanges' };

/** Commands UI → worker for M2 (TS §8.2). */
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

export type EngineQueryResult = { kind: 'exchanges'; exchanges: ExchangeInfo[] };

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
  /** Tick after which the command took effect. */
  setBackgroundMode: { tick: Tick };
}

/** Error codes of replies (TS §8.3); the UI turns them into texts. */
export const ENGINE_ERRORS = [
  /** Envelope or type unknown. */
  'invalid-message',
  /** Payload invalid, or a game command the engine rejects. */
  'invalid-command',
  'player-not-loaded',
  /** A jump runs; only `cancelJump`, `unloadPlayer`, `setVisibility`, queries and subscriptions pass. */
  'busy',
  'tick-mismatch',
  'invalid-jump-target',
  /** The write-ahead of a game command failed; the command was not applied (TS §8.5). */
  'storage-failed',
  'internal-error',
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

export const PROGRESS_KINDS = ['init', 'catch-up', 'jump'] as const;
export type ProgressKind = (typeof PROGRESS_KINDS)[number];
export const PROGRESS_STATES = ['running', 'done', 'cancelled'] as const;
export type ProgressState = (typeof PROGRESS_STATES)[number];

/** Progress of initialisation, catching up and jumps (TS §3.7); `done` and `total` in steps. */
export interface ProgressPayload {
  kind: ProgressKind;
  state: ProgressState;
  done: number;
  total: number;
}

export interface FatalPayload {
  message: string;
}

/** Events worker → UI for M2 (TS §8.3). */
export interface EngineEventPayloads {
  clock: ClockPayload;
  quotes: QuotesPayload;
  progress: ProgressPayload;
  reply: ReplyPayload;
  fatal: FatalPayload;
}

export const ENGINE_EVENT_TYPES = [
  'clock',
  'quotes',
  'progress',
  'reply',
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
