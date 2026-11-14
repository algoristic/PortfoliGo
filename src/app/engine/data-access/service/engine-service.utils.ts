import { ACCOUNT_KINDS, OPENABLE_ACCOUNT_KINDS } from '@app/banking/domain/models/account.model';
import { TRANSACTION_TYPES } from '@app/banking/domain/models/ledger.model';
import { MAX_STATEMENT_LIMIT } from '@app/banking/domain/models/statement.model';
import { SPEEDS } from '@app/clock/domain/models/speed.model';
import { MAX_UPCOMING_DAYS } from '@app/dashboard/domain/models/upcoming.model';
import { isBackgroundPauseAfter, isBackgroundSpeed } from '@app/engine/domain/background-logic';
import { BACKGROUND_MODES } from '@app/engine/domain/models/game-state.model';
import { MAX_CANDLE_LIMIT } from '@app/market/domain/candle-window';
import { CANDLE_RESOLUTIONS } from '@app/market/domain/models/candle.model';
import { INSTRUMENT_KINDS } from '@app/market/domain/models/instrument.model';
import { SCREENER_SORT_KEYS, SORT_DIRECTIONS } from '@app/market/domain/models/screener.model';
import {
  AUTO_PAUSE_CODES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CODES,
} from '@app/notifications/domain/models/notification.model';
import { MAX_NOTIFICATION_LIMIT } from '@app/notifications/domain/notification-page-logic';
import { MAX_STORED_NOTIFICATIONS } from '@app/notifications/domain/read-state-logic';
import { DISTRIBUTION_KINDS } from '@app/portfolio/domain/models/distribution.model';
import { MAX_POSITION_TRADES } from '@app/portfolio/domain/models/position-detail.model';
import { MAX_HISTORY_POINTS } from '@app/portfolio/domain/performance-logic';
import {
  ORDER_REJECTIONS,
  ORDER_SIDES,
  ORDER_STATUSES,
} from '@app/trading/domain/models/order.model';
import { SAVINGS_PLAN_FAILURES } from '@app/trading/domain/models/savings-plan.model';
import { isOrderChange, isOrderSpec } from '@app/trading/domain/order-command-logic';
import {
  REGION_IDS,
  SECTOR_IDS,
  SIZE_CLASSES,
  STYLES,
} from '@app/world/domain/models/taxonomy.model';

import {
  ENGINE_COMMAND_TYPES,
  ENGINE_ERRORS,
  ENGINE_EVENT_TYPES,
  ENGINE_PROTOCOL,
  ENGINE_QUERY_KINDS,
  ENGINE_WARNINGS,
  EngineCommandMessage,
  EngineEventMessage,
  MAX_SCREENER_SEARCH_LENGTH,
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

function isListOf(check: Check): Check {
  return (value) => Array.isArray(value) && value.every(check);
}

const isSpeedId = isOneOf(SPEED_IDS);
const isBackgroundMode = isOneOf(BACKGROUND_MODES);
const isSeriesList: Check = isListOf(isCount);
const isCandleResolution = isOneOf(CANDLE_RESOLUTIONS);

function isChartSubscription(value: unknown): boolean {
  return hasFields(value, { series: isCount, interval: isCandleResolution });
}

function isSubscription(payload: unknown): boolean {
  return hasFields(payload, {
    series: isSeriesList,
    movers: isOptional(isBoolean),
    charts: isOptional(isListOf(isChartSubscription)),
  });
}

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

function isNotificationsQuery(value: Fields): boolean {
  return hasFields(value, {
    category: isOptional(isOneOf(NOTIFICATION_CATEGORIES)),
    offset: isCount,
    limit: (limit) => isCount(limit) && limit <= MAX_NOTIFICATION_LIMIT,
  });
}

/** At least one of `upTo` and `seqs`; numbers of notifications are ≥ 1. */
function isMarkReadPayload(value: unknown): boolean {
  return (
    hasFields(value, {
      upTo: isOptional(isCount),
      seqs: isOptional(
        (seqs) =>
          Array.isArray(seqs) &&
          seqs.length <= MAX_STORED_NOTIFICATIONS &&
          seqs.every((seq) => isCount(seq) && seq >= 1),
      ),
    }) &&
    ((value as Fields)['upTo'] !== undefined || (value as Fields)['seqs'] !== undefined)
  );
}

/**
 * Longest list `updateWatchlist` may carry: a bound of the message shape only; the engine checks
 * `MAX_WATCHLIST_LENGTH`, the IDs and duplicates with its own codes.
 */
const MAX_WATCHLIST_PAYLOAD_LENGTH = 1_000;

function isWatchlistIds(value: unknown): boolean {
  return (
    Array.isArray(value) && value.length <= MAX_WATCHLIST_PAYLOAD_LENGTH && value.every(isString)
  );
}

function isScreenerQuery(value: Fields): boolean {
  return hasFields(value, {
    search: isOptional((search) => isString(search) && search.length <= MAX_SCREENER_SEARCH_LENGTH),
    assetClasses: isOptional(isListOf(isOneOf(INSTRUMENT_KINDS))),
    regions: isOptional(isListOf(isOneOf(REGION_IDS))),
    countries: isOptional(isListOf(isNonEmptyString)),
    sectors: isOptional(isListOf(isOneOf(SECTOR_IDS))),
    industries: isOptional(isListOf(isNonEmptyString)),
    sizes: isOptional(isListOf(isOneOf(SIZE_CLASSES))),
    styles: isOptional(isListOf(isOneOf(STYLES))),
    dividendYield: isOptional((range) =>
      hasFields(range, { min: isOptional(isFiniteNumber), max: isOptional(isFiniteNumber) }),
    ),
    sort: isOptional((sort) =>
      hasFields(sort, {
        key: isOneOf(SCREENER_SORT_KEYS),
        direction: isOneOf(SORT_DIRECTIONS),
      }),
    ),
  });
}

function isCandlesQuery(value: Fields): boolean {
  return hasFields(value, {
    series: isCount,
    interval: isCandleResolution,
    from: isOptional(isCount),
    to: isOptional(isCount),
    limit: isOptional((limit) => isCount(limit) && limit >= 1 && limit <= MAX_CANDLE_LIMIT),
  });
}

function isPerformanceHistoryQuery(value: Fields): boolean {
  return hasFields(value, {
    fromDay: isOptional(isCents),
    maxPoints: isOptional((count) => isCount(count) && count >= 2 && count <= MAX_HISTORY_POINTS),
  });
}

function isUpcomingQuery(value: Fields): boolean {
  return hasFields(value, {
    days: isOptional((days) => isCount(days) && days >= 1 && days <= MAX_UPCOMING_DAYS),
  });
}

function isPositionTradesQuery(value: Fields): boolean {
  return hasFields(value, {
    instrumentId: isNonEmptyString,
    depotId: isOptional(isDepotId),
    limit: isOptional((limit) => isCount(limit) && limit >= 1 && limit <= MAX_POSITION_TRADES),
  });
}

function isStandingOrderId(value: unknown): boolean {
  return isString(value) && /^so-[1-9]\d*$/.test(value);
}

function isStandingOrderSpec(value: unknown): boolean {
  return hasFields(value, {
    fromAccountId: isAccountId,
    toAccountId: isAccountId,
    amount: isCents,
    day: isCount,
    purpose: isString,
  });
}

function isStandingOrderView(value: unknown): boolean {
  return (
    isStandingOrderSpec(value) &&
    hasFields(value, {
      id: isStandingOrderId,
      createdAt: isCount,
      paused: isBoolean,
      handledUpTo: (month) => isString(month) && /^\d{4}-\d{2}$/.test(month),
      nextExecution: isNullOr(isCount),
    })
  );
}

function isSavingsPlanId(value: unknown): boolean {
  return isString(value) && /^sp-[1-9]\d*$/.test(value);
}

function isSavingsPlanChange(value: unknown): boolean {
  return hasFields(value, { amount: isCents, day: isCount });
}

function isSavingsPlanSpec(value: unknown): boolean {
  return (
    isSavingsPlanChange(value) &&
    hasFields(value, { depotId: isDepotId, instrumentId: isNonEmptyString })
  );
}

function isSavingsPlanView(value: unknown): boolean {
  return (
    isSavingsPlanSpec(value) &&
    hasFields(value, {
      id: isSavingsPlanId,
      createdAt: isCount,
      paused: isBoolean,
      handledUpTo: (month) => isString(month) && /^\d{4}-\d{2}$/.test(month),
      nextExecution: isNullOr(isCount),
    })
  );
}

const isSavingsPlanParams: Check = (params) =>
  hasFields(params, {
    savingsPlanId: isSavingsPlanId,
    depotId: isDepotId,
    instrumentId: isNonEmptyString,
    amount: isCount,
  });

function isQuery(value: unknown): boolean {
  if (!isFields(value) || !isOneOf(ENGINE_QUERY_KINDS)(value['kind'])) {
    return false;
  }
  switch (value['kind']) {
    case 'closingPreview':
      return isAccountId(value['accountId']);
    case 'statement':
      return isStatementQuery(value);
    case 'notifications':
      return isNotificationsQuery(value);
    case 'instrumentDetails':
    case 'instrumentFigures':
    case 'instrumentDividends':
    case 'instrumentComposition':
      return isNonEmptyString(value['id']);
    case 'screener':
      return isScreenerQuery(value);
    case 'candles':
      return isCandlesQuery(value);
    case 'performanceHistory':
      return isPerformanceHistoryQuery(value);
    case 'upcoming':
      return isUpcomingQuery(value);
    case 'positionTrades':
      return isPositionTradesQuery(value);
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
  setFrozen: (payload) => hasFields(payload, { frozen: isBoolean }),
  jumpTo: (payload) => hasFields(payload, { target: isJumpTarget }),
  cancelJump: isFields,
  subscribe: isSubscription,
  unsubscribe: isSubscription,
  query: (payload) => hasFields(payload, { query: isQuery }),
  setBackgroundMode: (payload) =>
    hasFields(payload, {
      mode: isBackgroundMode,
      speed: isOptional(isBackgroundSpeed),
      pauseAfter: isOptional(isBackgroundPauseAfter),
    }),
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
  // The shape only; day range and purpose length are rules of the engine (TS §7.4).
  createStandingOrder: (payload) => hasFields(payload, { order: isStandingOrderSpec }),
  changeStandingOrder: (payload) =>
    hasFields(payload, { standingOrderId: isStandingOrderId, order: isStandingOrderSpec }),
  setStandingOrderPaused: (payload) =>
    hasFields(payload, { standingOrderId: isStandingOrderId, paused: isBoolean }),
  deleteStandingOrder: (payload) => hasFields(payload, { standingOrderId: isStandingOrderId }),
  setAutoPause: (payload) =>
    hasFields(payload, { code: isOneOf(AUTO_PAUSE_CODES), enabled: isBoolean }),
  markNotificationsRead: isMarkReadPayload,
  updateWatchlist: (payload) => hasFields(payload, { ids: isWatchlistIds }),
  // The shape only; quantities, prices and dates are rules of the engine (TS §7.5).
  placeOrder: (payload) => hasFields(payload, { order: isOrderSpec }),
  changeOrder: (payload) =>
    hasFields(payload, { orderId: isNonEmptyString, change: isOrderChange }),
  cancelOrder: (payload) => hasFields(payload, { orderId: isNonEmptyString }),
  // The shape only; eligibility, amount and day are rules of the engine (TS §7.8).
  createSavingsPlan: (payload) => hasFields(payload, { plan: isSavingsPlanSpec }),
  changeSavingsPlan: (payload) =>
    hasFields(payload, { savingsPlanId: isSavingsPlanId, change: isSavingsPlanChange }),
  setSavingsPlanPaused: (payload) =>
    hasFields(payload, { savingsPlanId: isSavingsPlanId, paused: isBoolean }),
  deleteSavingsPlan: (payload) => hasFields(payload, { savingsPlanId: isSavingsPlanId }),
  exportPlayer: (payload) => hasFields(payload, { name: isString }),
  importPlayer: (payload) => hasFields(payload, { content: isString, playerId: isNonEmptyString }),
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

/** Candles of the events are complete; the first weekly candle starts before the epoch. */
function isCandle(value: unknown): boolean {
  return hasFields(value, {
    tick: isCents,
    open: isFiniteNumber,
    high: isFiniteNumber,
    low: isFiniteNumber,
    close: isFiniteNumber,
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
    reserved: isCount,
    salaryAccount: isBoolean,
  });
}

function isOrderView(value: unknown): boolean {
  return (
    isOrderSpec(value) &&
    hasFields(value, {
      id: isNonEmptyString,
      depotId: isDepotId,
      status: isOneOf(ORDER_STATUSES),
      placedAt: isCount,
      expiresAt: isCount,
      reserved: isCount,
      triggeredAt: isNullOr(isCount),
      execution: isNullOr((execution) =>
        hasFields(execution, {
          tick: isCount,
          quantity: isCount,
          price: isFiniteNumber,
          marketValue: isCount,
          orderFee: isCount,
          exchangeFee: isCount,
          total: isCount,
        }),
      ),
      closedAt: isNullOr(isCount),
      rejection: isNullOr(isOneOf(ORDER_REJECTIONS)),
    })
  );
}

function isTaxYear(value: unknown): boolean {
  return hasFields(value, {
    year: isCount,
    lossCarryForward: isCents,
    income: isCents,
    withheld: isCents,
    interest: isCents,
    distributions: isCents,
    gains: isCents,
    losses: isCents,
    paid: isCents,
    refunded: isCents,
  });
}

function isTaxesProjection(value: unknown): boolean {
  return hasFields(value, { current: isTaxYear, closed: isListOf(isTaxYear) });
}

function isTradingProjection(value: unknown): boolean {
  return hasFields(value, {
    orders: isListOf(isOrderView),
    depots: isListOf((depot) =>
      hasFields(depot, {
        depotId: isDepotId,
        positions: isListOf((position) =>
          hasFields(position, {
            instrumentId: isNonEmptyString,
            quantity: isCount,
            free: isCents,
            cost: isCents,
            lots: isListOf((lot) =>
              hasFields(lot, { buyTick: isCount, quantity: isCount, cost: isCents }),
            ),
            realizedGain: isCents,
            distributions: isCents,
          }),
        ),
      }),
    ),
  });
}

function isMonthlyValues(value: unknown): boolean {
  return hasFields(value, {
    income: isCents,
    livingCosts: isCents,
    fees: isCents,
    creditInterest: isCents,
    debitInterest: isCents,
    taxes: isCents,
    dividends: isCents,
    orderFees: isCents,
    savingsPlanFees: isCents,
    accountFees: isCents,
    custodyFees: isCents,
    spreadCosts: isCents,
    terCosts: isFiniteNumber,
  });
}

function isOrderParams(params: unknown): boolean {
  return hasFields(params, {
    orderId: isNonEmptyString,
    depotId: isDepotId,
    instrumentId: isNonEmptyString,
    side: isOneOf(ORDER_SIDES),
  });
}

const isCoverageParams: Check = (params) =>
  hasFields(params, { accountId: isAccountId, balance: isCents, limit: isNullOr(isCount) });

/** Parameters of the codes the engine creates; the others are flat codes and numbers. */
const NOTIFICATION_PARAMS: Readonly<Partial<Record<string, Check>>> = {
  'account-uncovered': isCoverageParams,
  'overdraft-limit-exceeded': isCoverageParams,
  'standing-order-failed': (params) =>
    hasFields(params, {
      standingOrderId: isStandingOrderId,
      fromAccountId: isAccountId,
      toAccountId: isAccountId,
      amount: isCount,
      available: isCount,
    }),
  'interest-credited': (params) =>
    hasFields(params, { accountId: isAccountId, amount: isCents, tax: isCents }),
  'tax-refund': (params) => hasFields(params, { accountId: isAccountId, amount: isCents }),
  'month-closed': (params) =>
    hasFields(params, { year: isCount, month: isCount, values: isMonthlyValues }),
  'year-closed': (params) =>
    hasFields(params, { year: isCount, taxableIncome: isCents, taxWithheld: isCents }),
  'order-executed': (params) =>
    isOrderParams(params) &&
    hasFields(params, {
      quantity: isCount,
      price: isFiniteNumber,
      total: isCount,
      tax: isCents,
    }),
  'order-rejected': (params) =>
    isOrderParams(params) && hasFields(params, { reason: isOneOf(ORDER_REJECTIONS) }),
  'order-expired': isOrderParams,
  'savings-plan-executed': (params) =>
    isSavingsPlanParams(params) &&
    hasFields(params, { quantity: isCount, price: isFiniteNumber, total: isCount }),
  'savings-plan-failed': (params) =>
    isSavingsPlanParams(params) &&
    hasFields(params, { reason: isOneOf(SAVINGS_PLAN_FAILURES), available: isCount }),
  'dividend-received': (params) =>
    hasFields(params, {
      kind: isOneOf(DISTRIBUTION_KINDS),
      accountId: isAccountId,
      depotId: isDepotId,
      instrumentId: isNonEmptyString,
      quantity: isCount,
      amount: isCents,
      tax: isCents,
    }),
};

const isFlatParams: Check = (params) =>
  isFields(params) &&
  Object.values(params).every(
    (value) => value === null || isString(value) || isFiniteNumber(value),
  );

function isNotification(value: unknown): boolean {
  if (
    !hasFields(value, { seq: isCount, tick: isCount, code: isOneOf(NOTIFICATION_CODES) }) ||
    (value as Fields)['seq'] === 0
  ) {
    return false;
  }
  const fields = value as Fields;
  const check = NOTIFICATION_PARAMS[fields['code'] as string] ?? isFlatParams;
  return check(fields['params']);
}

const isNotificationList: Check = (list) => Array.isArray(list) && list.every(isNotification);

function isAbsenceReport(value: unknown): boolean {
  return hasFields(value, {
    from: isCount,
    to: isCount,
    netWorthBefore: isCents,
    netWorthAfter: isCents,
    flows: isMonthlyValues,
    bookings: isCount,
    notifications: isCount,
    warnings: isNotificationList,
    warningCount: isCount,
    orders: isNotificationList,
    orderCount: isCount,
    indices: (indices) =>
      Array.isArray(indices) &&
      indices.every((index) =>
        hasFields(index, {
          series: isCount,
          id: isString,
          name: isString,
          start: isFiniteNumber,
          end: isFiniteNumber,
        }),
      ),
  });
}

function isPeriodReturns(value: unknown): boolean {
  return hasFields(value, {
    sinceStart: isFiniteNumber,
    yearToDate: isNullOr(isFiniteNumber),
    annualized: isNullOr(isFiniteNumber),
  });
}

function isPerformanceFigures(value: unknown): boolean {
  return hasFields(value, {
    tick: isCount,
    startTick: isCount,
    startValue: isCents,
    netWorth: isCents,
    cash: isCents,
    securities: isCents,
    totalFlow: isCents,
    comparison: isCents,
    sinceStart: isCents,
    today: (today) =>
      hasFields(today, { change: isCents, ratio: isNullOr(isFiniteNumber), flow: isCents }),
    returns: isPeriodReturns,
    skippedDays: isCount,
    benchmark: isNullOr((benchmark) =>
      hasFields(benchmark, { value: isCents, returns: isPeriodReturns }),
    ),
  });
}

function isNotificationsProjection(value: unknown): boolean {
  return (
    hasFields(value, { lastSeq: isCount, unread: isCount, autoPause: isFields }) &&
    AUTO_PAUSE_CODES.every((code) => isBoolean(((value as Fields)['autoPause'] as Fields)[code]))
  );
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
      backgroundSpeed: isBackgroundSpeed,
      backgroundPauseAfter: isBackgroundPauseAfter,
      effectiveSpeed: isNullOr(isSpeedId),
      overloaded: isBoolean,
      jumping: isBoolean,
      autoPause: isOptional((cause) =>
        hasFields(cause, { seq: isCount, code: isOneOf(AUTO_PAUSE_CODES) }),
      ),
    }),
  quotes: (payload) =>
    hasFields(payload, {
      tick: isCount,
      quotes: (quotes) => Array.isArray(quotes) && quotes.every(isQuote),
    }),
  movers: (payload) =>
    hasFields(payload, {
      tick: isCount,
      gainers: isListOf(isQuote),
      losers: isListOf(isQuote),
      sectors: isListOf((sector) =>
        hasFields(sector, { sectorId: isOneOf(SECTOR_IDS), quote: isQuote }),
      ),
    }),
  candle: (payload) =>
    hasFields(payload, {
      tick: isCount,
      series: isCount,
      interval: isCandleResolution,
      candle: isCandle,
      previous: isOptional(isCandle),
    }),
  projection: (payload) =>
    hasFields(payload, {
      tick: isCount,
      full: isBoolean,
      accounts: (accounts) => Array.isArray(accounts) && accounts.every(isAccountView),
      netWorth: isCents,
      notifications: isOptional(isNotificationsProjection),
      watchlist: isOptional((watchlist) => hasFields(watchlist, { ids: isListOf(isString) })),
      trading: isOptional(isTradingProjection),
      taxes: isOptional(isTaxesProjection),
      standingOrders: isOptional(isListOf(isStandingOrderView)),
      savingsPlans: isOptional(isListOf(isSavingsPlanView)),
      performance: isOptional(isPerformanceFigures),
    }),
  notification: (payload) =>
    hasFields(payload, { tick: isCount, notifications: isNotificationList }),
  report: isAbsenceReport,
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
