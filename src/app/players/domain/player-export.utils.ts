import { dayIndex } from '@app/clock/domain/calendar-logic';
import { SPEEDS } from '@app/clock/domain/models/speed.model';
import {
  isBackgroundMode,
  isBackgroundPauseAfter,
  isBackgroundSpeed,
} from '@app/engine/domain/background-logic';
import { MARKET_PHASES } from '@app/market/domain/models/market-config.model';

import {
  EXPORT_CHECKSUM_PREFIX,
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  PlayerExport,
} from './models/player-export.model';

// Hand-written type guards for an export file after `fromTaggedJson` (TS §10.3). They check the
// format's fields and the shape of the state down to the records of its lists; the rules of the
// game (balances against the journal, valid orders) stay with the engine. They take any value and
// answer with `false` instead of throwing.

type Fields = Record<string, unknown>;
type Check = (value: unknown) => boolean;

const SPEED_IDS: readonly unknown[] = SPEEDS.map(({ id }) => id);

/** Market arrays per instrument, per index and per ETF (`MarketState`). */
const INSTRUMENT_ARRAYS = ['idioClose', 'idioTransient', 'logClose', 'dividendCents'] as const;
const FACTOR_ARRAYS = ['trend', 'logVol', 'level'] as const;
const ETF_ARRAYS = ['etfScale', 'etfPot'] as const;

/** Fields of `PlayerState` by type (TS §7.2–§7.9). */
const PLAYER_ARRAYS = [
  'accounts',
  'depots',
  'overdraftLimits',
  'inflows',
  'interest',
  'closedTaxYears',
  'closedMonths',
  'orders',
  'orderHistory',
  'positions',
  'pendingDistributions',
  'custody',
  'standingOrders',
  'savingsPlans',
] as const;
const PLAYER_COUNTS = [
  'accountSequence',
  'nextTransactionSeq',
  'orderSequence',
  'standingOrderSequence',
  'savingsPlanSequence',
] as const;

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasFields(value: unknown, checks: Readonly<Record<string, Check>>): value is Fields {
  return isFields(value) && Object.entries(checks).every(([key, check]) => check(value[key]));
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

function isCount(value: unknown): value is number {
  return isInteger(value) && value >= 0;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isArrayOf(check: Check): Check {
  return (value) => Array.isArray(value) && value.every(check);
}

function isIsoTime(value: unknown): value is string {
  return isString(value) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
}

function isHex(length: number): Check {
  const pattern = new RegExp(`^[0-9a-f]{${length}}$`);
  return (value) => isString(value) && pattern.test(value);
}

function isStartConditions(value: unknown): boolean {
  return hasFields(value, {
    startCapital: isInteger,
    netIncome: isInteger,
    livingCosts: isInteger,
  });
}

function isBalances(value: unknown): boolean {
  return (
    value instanceof Map &&
    [...value.entries()].every(([key, cents]) => isString(key) && isInteger(cents))
  );
}

function isPlayerState(value: unknown): boolean {
  return (
    hasFields(value, {
      start: isStartConditions,
      homeBankId: isString,
      backgroundMode: isBackgroundMode,
      backgroundSpeed: isBackgroundSpeed,
      backgroundPauseAfter: isBackgroundPauseAfter,
      balances: isBalances,
      salaryAccountId: isString,
      taxYear: isFields,
      monthlyValues: isFields,
      notifications: (notifications) =>
        hasFields(notifications, {
          nextSeq: (seq) => isCount(seq) && seq >= 1,
          readUpTo: isCount,
          readSeqs: isArrayOf(isCount),
          autoPause: isFields,
        }),
      watchlist: isArrayOf(isString),
      performance: (performance) =>
        hasFields(performance, {
          startTick: isCount,
          day: isCount,
          index: isNumber,
          benchmark: (benchmark) => benchmark === null || isFields(benchmark),
        }),
    }) &&
    PLAYER_ARRAYS.every((key) => isArrayOf(isFields)(value[key])) &&
    PLAYER_COUNTS.every((key) => isCount(value[key]))
  );
}

function isScheduler(value: unknown): boolean {
  return hasFields(value, {
    heap: isArrayOf((task) => hasFields(task, { tick: isInteger, seq: isCount, kind: isString })),
    nextSeq: isCount,
  });
}

function isMarket(value: unknown): boolean {
  if (
    !hasFields(value, {
      day: isCount,
      phase: (phase) => (MARKET_PHASES as readonly unknown[]).includes(phase),
      nextExDay: (days) => days instanceof Int32Array,
      etfNextExDay: (days) => days instanceof Int32Array,
      indexReinvest: (values) => values instanceof Float64Array,
    })
  ) {
    return false;
  }
  const lengths = (keys: readonly string[], first: unknown): boolean =>
    keys.every(
      (key) =>
        value[key] instanceof Float64Array &&
        value[key].length === (first as ArrayLike<number>).length,
    );
  return (
    lengths(INSTRUMENT_ARRAYS, value['nextExDay']) &&
    lengths(ETF_ARRAYS, value['etfNextExDay']) &&
    lengths(FACTOR_ARRAYS, value['trend'] ?? [])
  );
}

function isJournalRecord(value: unknown): boolean {
  return hasFields(value, { seq: (seq) => isCount(seq) && seq >= 1, tick: isInteger });
}

/**
 * An export of format version 1 (TS §10.1) whose clock, state and market belong to the same tick:
 * `clock.tick` = `state.tick`, `market.day` = its day, the journal not after it.
 */
export function isPlayerExport(value: unknown): value is PlayerExport {
  if (
    !hasFields(value, {
      format: (format) => format === EXPORT_FORMAT,
      formatVersion: (version) => version === EXPORT_FORMAT_VERSION,
      appVersion: isString,
      simVersion: isCount,
      schemaVersion: isCount,
      exportedAt: isIsoTime,
      player: (player) =>
        hasFields(player, { name: isString, seed: isString, startConditions: isStartConditions }),
      clock: (clock) =>
        hasFields(clock, {
          tick: isCount,
          speed: (speed) => SPEED_IDS.includes(speed),
          paused: isBoolean,
          lastSeenAt: isIsoTime,
        }),
      state: (state) =>
        hasFields(state, {
          tick: isCount,
          player: isPlayerState,
          scheduler: isScheduler,
          commandIds: isArrayOf(isString),
        }),
      market: isMarket,
      marketChecksum: isHex(32),
      transactions: isArrayOf(
        (transaction) =>
          isJournalRecord(transaction) &&
          hasFields(transaction, { postings: isArrayOf(isFields), type: isString }),
      ),
      notifications: isArrayOf(
        (notification) =>
          isJournalRecord(notification) && hasFields(notification, { code: isString }),
      ),
      series: (series) =>
        hasFields(series, {
          performance: isArrayOf((point) => hasFields(point, { day: isCount, tick: isCount })),
        }),
      checksum: (checksum) =>
        isString(checksum) &&
        checksum.startsWith(EXPORT_CHECKSUM_PREFIX) &&
        isHex(64)(checksum.slice(EXPORT_CHECKSUM_PREFIX.length)),
    })
  ) {
    return false;
  }
  const exported = value as unknown as PlayerExport;
  const tick = exported.state.tick;
  return (
    exported.clock.tick === tick &&
    exported.market.day === dayIndex(tick) &&
    exported.transactions.every((transaction) => transaction.tick <= tick) &&
    exported.notifications.every((notification) => notification.tick <= tick) &&
    exported.series.performance.every((point) => point.tick <= tick)
  );
}
