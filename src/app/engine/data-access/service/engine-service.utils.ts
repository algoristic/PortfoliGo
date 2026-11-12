import { SPEEDS } from '@app/clock/domain/models/speed.model';
import { BACKGROUND_MODES } from '@app/engine/domain/models/game-state.model';

import {
  ENGINE_COMMAND_TYPES,
  ENGINE_ERRORS,
  ENGINE_EVENT_TYPES,
  ENGINE_PROTOCOL,
  EngineCommandMessage,
  EngineEventMessage,
  PROGRESS_KINDS,
  PROGRESS_STATES,
} from './engine-service.model';

// Type guards for the messages between UI and worker (TS §8.3). They take any value, including
// what another version of the app might post, and answer with `false` instead of throwing.

type Fields = Record<string, unknown>;
type Check = (value: unknown) => boolean;

const SPEED_IDS: readonly string[] = SPEEDS.map((speed) => speed.id);

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isFiniteNumber(value: unknown): value is number {
  return Number.isFinite(value);
}

/** Ticks, cents, counts and series indices: non-negative safe integers. */
function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isOneOf(list: readonly string[]): Check {
  return (value) => isString(value) && list.includes(value);
}

function isNullOr(check: Check): Check {
  return (value) => value === null || check(value);
}

function hasFields(value: unknown, checks: Readonly<Record<string, Check>>): boolean {
  return isFields(value) && Object.entries(checks).every(([key, check]) => check(value[key]));
}

const isSpeedId = isOneOf(SPEED_IDS);
const isBackgroundMode = isOneOf(BACKGROUND_MODES);
const isSeriesList: Check = (value) => Array.isArray(value) && value.every(isCount);

function isStartConditions(value: unknown): boolean {
  return hasFields(value, { startCapital: isCount, netIncome: isCount, livingCosts: isCount });
}

function isJumpTarget(value: unknown): boolean {
  if (!isFields(value)) {
    return false;
  }
  switch (value['kind']) {
    case 'next-open':
    case 'next-month':
      return true;
    case 'date':
      return isCount(value['tick']);
    default:
      return false;
  }
}

function isQuery(value: unknown): boolean {
  return hasFields(value, { kind: (kind) => kind === 'exchanges' });
}

const COMMAND_PAYLOADS: Readonly<Record<EngineCommandMessage['type'], Check>> = {
  loadPlayer: (payload) =>
    hasFields(payload, {
      playerId: (id) => isString(id) && id.length > 0,
      seed: isString,
      start: isStartConditions,
    }),
  unloadPlayer: isFields,
  setSpeed: (payload) => hasFields(payload, { speed: isSpeedId }),
  pause: isFields,
  resume: isFields,
  setVisibility: (payload) => hasFields(payload, { visible: isBoolean }),
  jumpTo: (payload) => hasFields(payload, { target: isJumpTarget }),
  cancelJump: isFields,
  subscribe: (payload) => hasFields(payload, { series: isSeriesList }),
  unsubscribe: (payload) => hasFields(payload, { series: isSeriesList }),
  query: (payload) => hasFields(payload, { query: isQuery }),
  setBackgroundMode: (payload) => hasFields(payload, { mode: isBackgroundMode }),
};

function isQuote(value: unknown): boolean {
  return hasFields(value, {
    series: isCount,
    last: isFiniteNumber,
    bid: isNullOr(isFiniteNumber),
    ask: isNullOr(isFiniteNumber),
    previousClose: isFiniteNumber,
    change: isFiniteNumber,
    changeRatio: isFiniteNumber,
  });
}

function isReply(payload: unknown): boolean {
  if (!isFields(payload)) {
    return false;
  }
  if (payload['ok'] === true) {
    return 'data' in payload;
  }
  return (
    payload['ok'] === false &&
    isOneOf(ENGINE_ERRORS)(payload['error']) &&
    (payload['message'] === undefined || isString(payload['message']))
  );
}

const EVENT_PAYLOADS: Readonly<Record<EngineEventMessage['type'], Check>> = {
  clock: (payload) =>
    hasFields(payload, {
      tick: isCount,
      speed: isSpeedId,
      paused: isBoolean,
      visible: isBoolean,
      backgroundMode: isBackgroundMode,
      effectiveSpeed: isNullOr(isSpeedId),
      overloaded: isBoolean,
      jumping: isBoolean,
    }),
  quotes: (payload) =>
    hasFields(payload, {
      tick: isCount,
      quotes: (quotes) => Array.isArray(quotes) && quotes.every(isQuote),
    }),
  progress: (payload) =>
    hasFields(payload, {
      kind: isOneOf(PROGRESS_KINDS),
      state: isOneOf(PROGRESS_STATES),
      done: isCount,
      total: isCount,
    }),
  reply: isReply,
  fatal: (payload) => hasFields(payload, { message: isString }),
};

/** Envelope of TS §8.3 with any type and payload. */
export function isEngineEnvelope(
  value: unknown,
): value is { protocol: 1; id: string; replyTo?: string; type: string; payload: unknown } {
  return (
    isFields(value) &&
    value['protocol'] === ENGINE_PROTOCOL &&
    isString(value['id']) &&
    value['id'].length > 0 &&
    (value['replyTo'] === undefined || isString(value['replyTo'])) &&
    isString(value['type']) &&
    'payload' in value
  );
}

/** Commands UI → worker with a valid payload. */
export function isEngineCommandMessage(value: unknown): value is EngineCommandMessage {
  return (
    isEngineEnvelope(value) &&
    isOneOf(ENGINE_COMMAND_TYPES)(value.type) &&
    COMMAND_PAYLOADS[value.type as EngineCommandMessage['type']](value.payload)
  );
}

/** Events worker → UI with a valid payload; replies carry `replyTo`. */
export function isEngineEventMessage(value: unknown): value is EngineEventMessage {
  return (
    isEngineEnvelope(value) &&
    isOneOf(ENGINE_EVENT_TYPES)(value.type) &&
    (value.type !== 'reply' || value.replyTo !== undefined) &&
    EVENT_PAYLOADS[value.type as EngineEventMessage['type']](value.payload)
  );
}

/** ID of a message that is not valid otherwise, so that the worker can still answer it. */
export function messageId(value: unknown): string | null {
  return isFields(value) && isString(value['id']) && value['id'].length > 0 ? value['id'] : null;
}
