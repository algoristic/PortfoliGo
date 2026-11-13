import { ACCOUNT_KINDS, OPENABLE_ACCOUNT_KINDS } from '@app/banking/domain/models/account.model';
import { TRANSACTION_TYPES } from '@app/banking/domain/models/ledger.model';
import { MAX_STATEMENT_LIMIT } from '@app/banking/domain/models/statement.model';
import { SPEEDS } from '@app/clock/domain/models/speed.model';
import { BACKGROUND_MODES } from '@app/engine/domain/models/game-state.model';

import {
  ENGINE_COMMAND_TYPES,
  ENGINE_ERRORS,
  ENGINE_EVENT_TYPES,
  ENGINE_PROTOCOL,
  ENGINE_QUERY_KINDS,
  ENGINE_WARNINGS,
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

/** Balances and amounts: whole cents of either sign. */
function isCents(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

/** `acc-<n>` and `dep-<n>` with the counter value n ≥ 1 (TS §7.2). */
const ACCOUNT_ID = /^acc-[1-9]\d*$/;
const DEPOT_ID = /^dep-[1-9]\d*$/;

function isAccountId(value: unknown): boolean {
  return isString(value) && ACCOUNT_ID.test(value);
}

function isDepotId(value: unknown): boolean {
  return isString(value) && DEPOT_ID.test(value);
}

function isNonEmptyString(value: unknown): boolean {
  return isString(value) && value.length > 0;
}

function isOneOf(list: readonly string[]): Check {
  return (value) => isString(value) && list.includes(value);
}

function isOptional(check: Check): Check {
  return (value) => value === undefined || check(value);
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

function isStatementQuery(value: Fields): boolean {
  return hasFields(value, {
    accountId: isAccountId,
    from: isOptional(isCount),
    to: isOptional(isCount),
    types: isOptional((types) => Array.isArray(types) && types.every(isOneOf(TRANSACTION_TYPES))),
    search: isOptional(isString),
    offset: isCount,
    limit: (limit) => isCount(limit) && limit <= MAX_STATEMENT_LIMIT,
  });
}

function isQuery(value: unknown): boolean {
  if (!isFields(value) || !isOneOf(ENGINE_QUERY_KINDS)(value['kind'])) {
    return false;
  }
  switch (value['kind']) {
    case 'closingPreview':
      return isAccountId(value['accountId']);
    case 'statement':
      return isStatementQuery(value);
    default:
      return true;
  }
}

const COMMAND_PAYLOADS: Readonly<Record<EngineCommandMessage['type'], Check>> = {
  loadPlayer: (payload) =>
    hasFields(payload, {
      playerId: (id) => isString(id) && id.length > 0,
      seed: isString,
      start: isStartConditions,
      minTick: isOptional(isCount),
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
  openAccount: (payload) =>
    hasFields(payload, { bankId: isNonEmptyString, kind: isOneOf(OPENABLE_ACCOUNT_KINDS) }),
  closeAccount: (payload) =>
    hasFields(payload, { accountId: isAccountId, targetAccountId: isOptional(isAccountId) }),
  setSalaryAccount: (payload) => hasFields(payload, { accountId: isAccountId }),
  // Amount and purpose length are rules of the engine, which answers with its own codes.
  transfer: (payload) =>
    hasFields(payload, {
      fromAccountId: isAccountId,
      toAccountId: isAccountId,
      amount: isCents,
      purpose: isString,
    }),
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

function isAccountView(value: unknown): boolean {
  return hasFields(value, {
    id: isAccountId,
    kind: isOneOf(ACCOUNT_KINDS),
    bankId: isString,
    number: isString,
    depot: isNullOr((depot) => hasFields(depot, { id: isDepotId, number: isString })),
    openedAt: isCount,
    closedAt: isNullOr(isCount),
    balance: isCents,
    overdraftLimit: isNullOr(isCount),
    available: isCount,
    salaryAccount: isBoolean,
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
  projection: (payload) =>
    hasFields(payload, {
      tick: isCount,
      full: isBoolean,
      accounts: (accounts) => Array.isArray(accounts) && accounts.every(isAccountView),
      netWorth: isCents,
    }),
  progress: (payload) =>
    hasFields(payload, {
      kind: isOneOf(PROGRESS_KINDS),
      state: isOneOf(PROGRESS_STATES),
      done: isCount,
      total: isCount,
    }),
  reply: isReply,
  warning: (payload) => hasFields(payload, { code: isOneOf(ENGINE_WARNINGS), message: isString }),
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
