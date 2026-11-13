import fc from 'fast-check';

import { ACCOUNT_KINDS, OPENABLE_ACCOUNT_KINDS } from '@app/banking/domain/models/account.model';
import { TRANSACTION_TYPES } from '@app/banking/domain/models/ledger.model';
import { MAX_STATEMENT_LIMIT } from '@app/banking/domain/models/statement.model';
import { SPEEDS } from '@app/clock/domain/models/speed.model';
import { BACKGROUND_MODES } from '@app/engine/domain/models/game-state.model';
import { INSTRUMENT_KINDS } from '@app/market/domain/models/instrument.model';
import { SCREENER_SORT_KEYS, SORT_DIRECTIONS } from '@app/market/domain/models/screener.model';
import {
  AUTO_PAUSE_CODES,
  NOTIFICATION_CATEGORIES,
} from '@app/notifications/domain/models/notification.model';
import { MAX_NOTIFICATION_LIMIT } from '@app/notifications/domain/notification-page-logic';
import {
  REGION_IDS,
  SECTOR_IDS,
  SIZE_CLASSES,
  STYLES,
} from '@app/world/domain/models/taxonomy.model';

import {
  ENGINE_ERRORS,
  ENGINE_WARNINGS,
  EngineCommandMessage,
  EngineEventMessage,
  PROGRESS_KINDS,
  PROGRESS_STATES,
} from './engine-service.model';
import {
  isEngineCommandMessage,
  isEngineEnvelope,
  isEngineEventMessage,
  messageId,
} from './engine-service.utils';

const arbId = fc.string({ minLength: 1, maxLength: 8 });
const arbCount = fc.nat({ max: 10_000_000 });
const arbSpeed = fc.constantFrom(...SPEEDS.map((speed) => speed.id));
const arbMode = fc.constantFrom(...BACKGROUND_MODES);
const arbPrice = fc.double({ min: 0.01, max: 1e6, noNaN: true });
const arbCents = fc.integer({ min: -1e12, max: 1e12 });
const arbAccountId = fc.integer({ min: 1, max: 1e9 }).map((n) => `acc-${n}`);
const arbDepotId = fc.integer({ min: 1, max: 1e9 }).map((n) => `dep-${n}`);

const arbStatementQuery = fc.record(
  {
    kind: fc.constant('statement' as const),
    accountId: arbAccountId,
    from: arbCount,
    to: arbCount,
    types: fc.subarray([...TRANSACTION_TYPES]),
    search: fc.string(),
    offset: arbCount,
    limit: fc.integer({ min: 0, max: MAX_STATEMENT_LIMIT }),
  },
  { requiredKeys: ['kind', 'accountId', 'offset', 'limit'] },
);

const arbScreenerQuery = fc.record(
  {
    kind: fc.constant('screener' as const),
    search: fc.string({ maxLength: 100 }),
    assetClasses: fc.subarray([...INSTRUMENT_KINDS]),
    regions: fc.subarray([...REGION_IDS]),
    countries: fc.array(fc.string({ minLength: 1, maxLength: 2 }), { maxLength: 3 }),
    sectors: fc.subarray([...SECTOR_IDS]),
    industries: fc.array(arbId, { maxLength: 3 }),
    sizes: fc.subarray([...SIZE_CLASSES]),
    styles: fc.subarray([...STYLES]),
    dividendYield: fc.record(
      {
        min: fc.double({ min: 0, max: 1, noNaN: true }),
        max: fc.double({ min: 0, max: 1, noNaN: true }),
      },
      { requiredKeys: [] },
    ),
    sort: fc.record({
      key: fc.constantFrom(...SCREENER_SORT_KEYS),
      direction: fc.constantFrom(...SORT_DIRECTIONS),
    }),
  },
  { requiredKeys: ['kind'] },
);

const arbMonthlyValues = fc.record({
  income: arbCents,
  livingCosts: arbCents,
  fees: arbCents,
  creditInterest: arbCents,
  debitInterest: arbCents,
  taxes: arbCents,
  dividends: arbCents,
});

const arbNotification = fc
  .oneof(
    fc.record({
      code: fc.constantFrom('account-uncovered' as const, 'overdraft-limit-exceeded' as const),
      params: fc.record({
        accountId: arbAccountId,
        balance: arbCents,
        limit: fc.option(arbCount, { nil: null }),
      }),
    }),
    fc.record({
      code: fc.constant('interest-credited' as const),
      params: fc.record({ accountId: arbAccountId, amount: arbCents, tax: arbCents }),
    }),
    fc.record({
      code: fc.constant('tax-refund' as const),
      params: fc.record({ accountId: arbAccountId, amount: arbCents }),
    }),
    fc.record({
      code: fc.constant('month-closed' as const),
      params: fc.record({
        year: arbCount,
        month: fc.integer({ min: 1, max: 12 }),
        values: arbMonthlyValues,
      }),
    }),
    fc.record({
      code: fc.constant('year-closed' as const),
      params: fc.record({ year: arbCount, taxableIncome: arbCents, taxWithheld: arbCents }),
    }),
    fc.record({
      code: fc.constantFrom('order-executed' as const, 'storage-quota-exceeded' as const),
      params: fc.dictionary(
        fc.string({ maxLength: 6 }),
        fc.oneof(fc.string(), arbCents, fc.constant(null)),
        { maxKeys: 3 },
      ),
    }),
  )
  .chain((body) =>
    fc.record({ seq: fc.integer({ min: 1, max: 1e9 }), tick: arbCount }).map((stamp) => ({
      ...stamp,
      ...body,
    })),
  );

const arbAutoPause = fc
  .array(fc.boolean(), { minLength: AUTO_PAUSE_CODES.length, maxLength: AUTO_PAUSE_CODES.length })
  .map((flags) => Object.fromEntries(AUTO_PAUSE_CODES.map((code, n) => [code, flags[n]])));

function envelope<T extends string, P>(type: T, payload: fc.Arbitrary<P>) {
  return fc.record({
    protocol: fc.constant(1 as const),
    id: arbId,
    type: fc.constant(type),
    payload,
  });
}

const arbCommand: fc.Arbitrary<EngineCommandMessage> = fc.oneof(
  envelope(
    'loadPlayer',
    fc.record(
      {
        playerId: arbId,
        seed: fc.string(),
        start: fc.record({ startCapital: arbCount, netIncome: arbCount, livingCosts: arbCount }),
        minTick: arbCount,
      },
      { requiredKeys: ['playerId', 'seed', 'start'] },
    ),
  ),
  envelope('unloadPlayer', fc.constant({})),
  envelope('setSpeed', fc.record({ speed: arbSpeed })),
  envelope('pause', fc.constant({})),
  envelope('resume', fc.constant({})),
  envelope('setVisibility', fc.record({ visible: fc.boolean() })),
  envelope(
    'jumpTo',
    fc.record({
      target: fc.oneof(
        fc.constant({ kind: 'next-open' as const }),
        fc.constant({ kind: 'next-month' as const }),
        fc.record({ kind: fc.constant('date' as const), tick: arbCount }),
      ),
    }),
  ),
  envelope('cancelJump', fc.constant({})),
  envelope(
    'subscribe',
    fc.record({ series: fc.array(arbCount), movers: fc.boolean() }, { requiredKeys: ['series'] }),
  ),
  envelope(
    'unsubscribe',
    fc.record({ series: fc.array(arbCount), movers: fc.boolean() }, { requiredKeys: ['series'] }),
  ),
  envelope(
    'query',
    fc.record({
      query: fc.oneof(
        fc.constant({ kind: 'exchanges' as const }),
        fc.constant({ kind: 'banks' as const }),
        fc.constant({ kind: 'monthlyValues' as const }),
        fc.record({ kind: fc.constant('closingPreview' as const), accountId: arbAccountId }),
        arbStatementQuery,
        fc.record(
          {
            kind: fc.constant('notifications' as const),
            category: fc.constantFrom(...NOTIFICATION_CATEGORIES),
            offset: arbCount,
            limit: fc.integer({ min: 0, max: MAX_NOTIFICATION_LIMIT }),
          },
          { requiredKeys: ['kind', 'offset', 'limit'] },
        ),
        fc.constant({ kind: 'absenceReport' as const }),
        fc.constant({ kind: 'instruments' as const }),
        fc.record({ kind: fc.constant('instrumentDetails' as const), id: arbId }),
        arbScreenerQuery,
      ),
    }),
  ),
  envelope('setBackgroundMode', fc.record({ mode: arbMode })),
  envelope(
    'openAccount',
    fc.record({ bankId: arbId, kind: fc.constantFrom(...OPENABLE_ACCOUNT_KINDS) }),
  ),
  envelope(
    'closeAccount',
    fc.record(
      { accountId: arbAccountId, targetAccountId: arbAccountId },
      { requiredKeys: ['accountId'] },
    ),
  ),
  envelope('setSalaryAccount', fc.record({ accountId: arbAccountId })),
  envelope(
    'transfer',
    fc.record({
      fromAccountId: arbAccountId,
      toAccountId: arbAccountId,
      amount: arbCents,
      purpose: fc.string(),
    }),
  ),
  envelope(
    'setAutoPause',
    fc.record({ code: fc.constantFrom(...AUTO_PAUSE_CODES), enabled: fc.boolean() }),
  ),
  envelope(
    'markNotificationsRead',
    fc.oneof(
      fc.record({ upTo: arbCount }),
      fc.record({ seqs: fc.array(fc.integer({ min: 1, max: 1e9 }), { maxLength: 5 }) }),
      fc.record({
        upTo: arbCount,
        seqs: fc.array(fc.integer({ min: 1, max: 1e9 }), { maxLength: 5 }),
      }),
    ),
  ),
) as fc.Arbitrary<EngineCommandMessage>;

const arbQuote = fc.record({
  series: arbCount,
  last: arbPrice,
  bid: fc.option(arbPrice, { nil: null }),
  ask: fc.option(arbPrice, { nil: null }),
  previousClose: arbPrice,
  change: fc.double({ min: -1e6, max: 1e6, noNaN: true }),
  changeRatio: fc.double({ min: -1, max: 1e3, noNaN: true }),
});

const arbAccountView = fc.record({
  id: arbAccountId,
  kind: fc.constantFrom(...ACCOUNT_KINDS),
  bankId: arbId,
  number: fc.string(),
  depot: fc.option(fc.record({ id: arbDepotId, number: fc.string() }), { nil: null }),
  openedAt: arbCount,
  closedAt: fc.option(arbCount, { nil: null }),
  balance: arbCents,
  overdraftLimit: fc.option(arbCount, { nil: null }),
  available: arbCount,
  salaryAccount: fc.boolean(),
});

const arbEvent: fc.Arbitrary<EngineEventMessage> = fc.oneof(
  envelope(
    'clock',
    fc.record(
      {
        tick: arbCount,
        speed: arbSpeed,
        paused: fc.boolean(),
        visible: fc.boolean(),
        backgroundMode: arbMode,
        effectiveSpeed: fc.option(arbSpeed, { nil: null }),
        overloaded: fc.boolean(),
        jumping: fc.boolean(),
        autoPause: fc.record({
          seq: fc.integer({ min: 1, max: 1e9 }),
          code: fc.constantFrom(...AUTO_PAUSE_CODES),
        }),
      },
      {
        requiredKeys: [
          'tick',
          'speed',
          'paused',
          'visible',
          'backgroundMode',
          'effectiveSpeed',
          'overloaded',
          'jumping',
        ],
      },
    ),
  ),
  envelope('quotes', fc.record({ tick: arbCount, quotes: fc.array(arbQuote, { maxLength: 4 }) })),
  envelope(
    'movers',
    fc.record({
      tick: arbCount,
      gainers: fc.array(arbQuote, { maxLength: 3 }),
      losers: fc.array(arbQuote, { maxLength: 3 }),
      sectors: fc.array(fc.record({ sectorId: fc.constantFrom(...SECTOR_IDS), quote: arbQuote }), {
        maxLength: 3,
      }),
    }),
  ),
  envelope(
    'projection',
    fc.record(
      {
        tick: arbCount,
        full: fc.boolean(),
        accounts: fc.array(arbAccountView, { maxLength: 4 }),
        netWorth: arbCents,
        notifications: fc.record({ lastSeq: arbCount, unread: arbCount, autoPause: arbAutoPause }),
      },
      { requiredKeys: ['tick', 'full', 'accounts', 'netWorth'] },
    ),
  ),
  envelope(
    'notification',
    fc.record({ tick: arbCount, notifications: fc.array(arbNotification, { maxLength: 4 }) }),
  ),
  envelope(
    'report',
    fc.record({
      from: arbCount,
      to: arbCount,
      netWorthBefore: arbCents,
      netWorthAfter: arbCents,
      flows: arbMonthlyValues,
      bookings: arbCount,
      notifications: arbCount,
      warnings: fc.array(arbNotification, { maxLength: 3 }),
      warningCount: arbCount,
      indices: fc.array(
        fc.record({
          series: arbCount,
          id: fc.string(),
          name: fc.string(),
          start: arbPrice,
          end: arbPrice,
        }),
        { maxLength: 3 },
      ),
    }),
  ),
  envelope(
    'progress',
    fc.record({
      kind: fc.constantFrom(...PROGRESS_KINDS),
      state: fc.constantFrom(...PROGRESS_STATES),
      done: arbCount,
      total: arbCount,
    }),
  ),
  fc
    .tuple(
      envelope(
        'reply',
        fc.oneof(
          fc.record({ ok: fc.constant(true as const), data: fc.jsonValue() }),
          fc.record(
            {
              ok: fc.constant(false as const),
              error: fc.constantFrom(...ENGINE_ERRORS),
              message: fc.string(),
            },
            { requiredKeys: ['ok', 'error'] },
          ),
        ),
      ),
      arbId,
    )
    .map(([message, replyTo]) => ({ ...message, replyTo })),
  envelope(
    'warning',
    fc.record({ code: fc.constantFrom(...ENGINE_WARNINGS), message: fc.string() }),
  ),
  envelope('fatal', fc.record({ message: fc.string() })),
) as fc.Arbitrary<EngineEventMessage>;

const command = (type: string, payload: unknown): unknown => ({
  protocol: 1,
  id: 'u1',
  type,
  payload,
});
const loadPlayer = (fields: Record<string, unknown>): unknown =>
  command('loadPlayer', {
    playerId: 'p',
    seed: 's',
    start: { startCapital: 0, netIncome: 0, livingCosts: 0 },
    ...fields,
  });
const event = (type: string, payload: unknown): unknown => ({
  protocol: 1,
  id: 'w1',
  type,
  payload,
});
const reply = (payload: unknown): unknown => ({
  ...(event('reply', payload) as object),
  replyTo: 'u1',
});
const CLOCK = {
  tick: 1,
  speed: '1h',
  paused: false,
  visible: true,
  backgroundMode: 'realtime',
  effectiveSpeed: null,
  overloaded: false,
  jumping: false,
};
const TRANSFER = { fromAccountId: 'acc-1', toAccountId: 'acc-2', amount: 100, purpose: 'Miete' };
const ACCOUNT = {
  id: 'acc-2',
  kind: 'clearing',
  bankId: 'b3',
  number: '0000000002',
  depot: { id: 'dep-3', number: '0000000003' },
  openedAt: 5_389_920,
  closedAt: null,
  balance: -1_479,
  overdraftLimit: null,
  available: 0,
  salaryAccount: false,
};
const STATEMENT = { kind: 'statement', accountId: 'acc-1', offset: 0, limit: 50 };
const projection = (fields: Record<string, unknown>): unknown =>
  event('projection', { tick: 1, full: false, accounts: [ACCOUNT], netWorth: 0, ...fields });
const MONTH_CLOSED = {
  seq: 1,
  tick: 5_433_120,
  code: 'month-closed',
  params: {
    year: 2030,
    month: 4,
    values: {
      income: 280_000,
      livingCosts: 170_000,
      fees: 0,
      creditInterest: 0,
      debitInterest: 0,
      taxes: 0,
      dividends: 0,
    },
  },
};
const UNCOVERED = {
  seq: 2,
  tick: 5_433_480,
  code: 'account-uncovered',
  params: { accountId: 'acc-1', balance: -100, limit: 200_000 },
};
const notification = (fields: Record<string, unknown>): unknown =>
  event('notification', { tick: 1, notifications: [{ ...UNCOVERED, ...fields }] });
const QUOTE = {
  series: 0,
  last: 1,
  bid: null,
  ask: null,
  previousClose: 1,
  change: 0,
  changeRatio: 0,
};

/** Replaces one top-level or payload field of a valid message with an arbitrary value. */
function corrupt<T extends object>(message: T, key: string, value: unknown, inPayload: boolean): T {
  if (inPayload) {
    const payload = (message as { payload: Record<string, unknown> }).payload;
    return { ...message, payload: { ...payload, [key]: value } };
  }
  return { ...message, [key]: value };
}

describe('engine protocol guards', () => {
  describe('isEngineCommandMessage', () => {
    it('accepts every valid command', () => {
      fc.assert(fc.property(arbCommand, (message) => isEngineCommandMessage(message)));
    });

    it('rejects arbitrary values without throwing', () => {
      fc.assert(
        fc.property(
          fc.anything({ withNullPrototype: true, withMap: true, withSet: true }),
          (value) => {
            expect(isEngineCommandMessage(value)).toBe(false);
            expect(isEngineEventMessage(value)).toBe(false);
          },
        ),
      );
    });

    it('never throws on a valid command with one field replaced', () => {
      fc.assert(
        fc.property(
          arbCommand,
          fc.constantFrom(
            'protocol',
            'id',
            'type',
            'payload',
            'speed',
            'series',
            'target',
            'start',
            'query',
            'accountId',
            'amount',
            'purpose',
          ),
          fc.anything(),
          fc.boolean(),
          (message, key, value, inPayload) => {
            expect(() =>
              isEngineCommandMessage(corrupt(message, key, value, inPayload)),
            ).not.toThrow();
          },
        ),
      );
    });

    it('never throws on a valid statement query with one field replaced', () => {
      fc.assert(
        fc.property(
          arbStatementQuery,
          fc.constantFrom('accountId', 'from', 'to', 'types', 'search', 'offset', 'limit'),
          fc.anything(),
          (query, key, value) => {
            expect(() =>
              isEngineCommandMessage(command('query', { query: { ...query, [key]: value } })),
            ).not.toThrow();
          },
        ),
      );
    });

    it.each([
      ['another protocol', { protocol: 2, id: 'u1', type: 'pause', payload: {} }],
      ['an empty id', { protocol: 1, id: '', type: 'pause', payload: {} }],
      ['no payload', { protocol: 1, id: 'u1', type: 'pause' }],
      ['an unknown type', { protocol: 1, id: 'u1', type: 'renamePlayer', payload: {} }],
      ['an unknown speed', { protocol: 1, id: 'u1', type: 'setSpeed', payload: { speed: '1M' } }],
      [
        'a negative series',
        { protocol: 1, id: 'u1', type: 'subscribe', payload: { series: [3, -1] } },
      ],
      [
        'a fractional jump tick',
        { protocol: 1, id: 'u1', type: 'jumpTo', payload: { target: { kind: 'date', tick: 1.5 } } },
      ],
      [
        'negative start capital',
        {
          protocol: 1,
          id: 'u1',
          type: 'loadPlayer',
          payload: {
            playerId: 'p',
            seed: 's',
            start: { startCapital: -1, netIncome: 0, livingCosts: 0 },
          },
        },
      ],
      [
        'an unknown background mode',
        { protocol: 1, id: 'u1', type: 'setBackgroundMode', payload: { mode: 'fast' } },
      ],
      [
        'an unknown query',
        { protocol: 1, id: 'u1', type: 'query', payload: { query: { kind: 'x' } } },
      ],
      ['an empty player id', loadPlayer({ playerId: '' })],
      ['a player id that is not a string', loadPlayer({ playerId: 7 })],
      ['a negative lower bound of the tick', loadPlayer({ minTick: -1 })],
      ['a lower bound of the tick given as a string', loadPlayer({ minTick: '5' })],
      ['a visibility that is not a boolean', command('setVisibility', { visible: 'yes' })],
      ['unsubscribe without a series list', command('unsubscribe', { series: 3 })],
      ['series given as strings', command('subscribe', { series: ['1'] })],
      ['a jump target that is not an object', command('jumpTo', { target: null })],
      ['an unknown jump target', command('jumpTo', { target: { kind: 'tomorrow' } })],
      ['a payload that is not an object', command('pause', null)],
      [
        'an account kind that cannot be opened',
        command('openAccount', { bankId: 'b1', kind: 'clearing' }),
      ],
      ['an empty bank id', command('openAccount', { bankId: '', kind: 'depot' })],
      ['a depot id as account', command('closeAccount', { accountId: 'dep-2' })],
      ['account number 0', command('setSalaryAccount', { accountId: 'acc-0' })],
      [
        'a target that is not an account',
        command('closeAccount', { accountId: 'acc-2', targetAccountId: 3 }),
      ],
      ['a fractional amount', command('transfer', { ...TRANSFER, amount: 1.5 })],
      ['an amount given as a string', command('transfer', { ...TRANSFER, amount: '100' })],
      ['no purpose', command('transfer', { ...TRANSFER, purpose: undefined })],
      [
        'a closing preview without an account',
        command('query', { query: { kind: 'closingPreview' } }),
      ],
      [
        'a statement without a page',
        command('query', { query: { ...STATEMENT, limit: undefined } }),
      ],
      [
        'a statement page above the limit',
        command('query', { query: { ...STATEMENT, limit: 201 } }),
      ],
      ['a negative statement offset', command('query', { query: { ...STATEMENT, offset: -1 } })],
      ['a statement of a depot', command('query', { query: { ...STATEMENT, accountId: 'dep-2' } })],
      ['a fractional start', command('query', { query: { ...STATEMENT, from: 0.5 } })],
      ['an end given as a string', command('query', { query: { ...STATEMENT, to: '9' } })],
      ['an unknown booking type', command('query', { query: { ...STATEMENT, types: ['gift'] } })],
      ['types that are not a list', command('query', { query: { ...STATEMENT, types: 'salary' } })],
      ['a search that is not a string', command('query', { query: { ...STATEMENT, search: 12 } })],
      ['an unknown notification code', command('setAutoPause', { code: 'fire', enabled: true })],
      [
        'auto-pause for the UI code',
        command('setAutoPause', { code: 'backup-reminder', enabled: true }),
      ],
      [
        'auto-pause switched by a string',
        command('setAutoPause', { code: 'month-closed', enabled: 'on' }),
      ],
      ['nothing to mark read', command('markNotificationsRead', {})],
      ['notification number 0', command('markNotificationsRead', { seqs: [0] })],
      ['a fractional mark', command('markNotificationsRead', { upTo: 1.5 })],
      ['numbers that are not a list', command('markNotificationsRead', { seqs: 3 })],
      [
        'more numbers than notifications are kept',
        command('markNotificationsRead', { seqs: Array.from({ length: 1_001 }, (_, n) => n + 1) }),
      ],
      [
        'a notification page above the limit',
        command('query', { query: { kind: 'notifications', offset: 0, limit: 201 } }),
      ],
      [
        'an unknown notification category',
        command('query', { query: { kind: 'notifications', category: 'x', offset: 0, limit: 1 } }),
      ],
      ['movers switched by a string', command('subscribe', { series: [], movers: 'yes' })],
      ['details without an ID', command('query', { query: { kind: 'instrumentDetails' } })],
      [
        'details of an empty ID',
        command('query', { query: { kind: 'instrumentDetails', id: '' } }),
      ],
      [
        'an unknown asset class',
        command('query', { query: { kind: 'screener', assetClasses: ['bond'] } }),
      ],
      [
        'a sector that is not a list',
        command('query', { query: { kind: 'screener', sectors: 'energy' } }),
      ],
      ['an unknown size', command('query', { query: { kind: 'screener', sizes: ['huge'] } })],
      ['an unknown style', command('query', { query: { kind: 'screener', styles: ['momentum'] } })],
      ['an empty country code', command('query', { query: { kind: 'screener', countries: [''] } })],
      [
        'an infinite yield bound',
        command('query', { query: { kind: 'screener', dividendYield: { max: Infinity } } }),
      ],
      [
        'a sort without direction',
        command('query', { query: { kind: 'screener', sort: { key: 'name' } } }),
      ],
      [
        'a search longer than 100 characters',
        command('query', { query: { kind: 'screener', search: 'x'.repeat(101) } }),
      ],
    ])('rejects a command with %s', (_label, message) => {
      expect(isEngineCommandMessage(message)).toBe(false);
    });

    it.each([
      ['series 0', command('subscribe', { series: [0] })],
      ['a jump to tick 0', command('jumpTo', { target: { kind: 'date', tick: 0 } })],
      ['zero start conditions', loadPlayer({})],
      ['a lower bound of the tick', loadPlayer({ minTick: 5_389_920 })],
      ['a depot to open', command('openAccount', { bankId: 'b3', kind: 'depot' })],
      ['a closing without target', command('closeAccount', { accountId: 'acc-12' })],
      // The engine answers these with its own codes (`invalid-amount`, `purpose-too-long`).
      ['a negative amount', command('transfer', { ...TRANSFER, amount: -100 })],
      ['a long purpose', command('transfer', { ...TRANSFER, purpose: 'x'.repeat(500) })],
      [
        'a closing preview',
        command('query', { query: { kind: 'closingPreview', accountId: 'acc-2' } }),
      ],
      ['the monthly values', command('query', { query: { kind: 'monthlyValues' } })],
      ['a statement page', command('query', { query: STATEMENT })],
      [
        'a filtered statement page',
        command('query', {
          query: {
            ...STATEMENT,
            from: 0,
            to: 5_389_920,
            types: ['salary', 'transfer'],
            search: '1.250',
            limit: 200,
          },
        }),
      ],
      ['an empty type list', command('query', { query: { ...STATEMENT, types: [] } })],
      ['all read up to 0', command('markNotificationsRead', { upTo: 0 })],
      ['single numbers read', command('markNotificationsRead', { seqs: [3, 1] })],
      [
        'auto-pause off',
        command('setAutoPause', { code: 'overdraft-limit-exceeded', enabled: false }),
      ],
      [
        'a notification page of a category',
        command('query', {
          query: { kind: 'notifications', category: 'account', offset: 0, limit: 200 },
        }),
      ],
      ['the absence report', command('query', { query: { kind: 'absenceReport' } })],
      ['the movers', command('subscribe', { series: [], movers: true })],
      ['the instruments', command('query', { query: { kind: 'instruments' } })],
      [
        'the details of a share',
        command('query', { query: { kind: 'instrumentDetails', id: 'cmp-001' } }),
      ],
      ['a screener without criteria', command('query', { query: { kind: 'screener' } })],
      [
        'a screener with every criterion',
        command('query', {
          query: {
            kind: 'screener',
            search: 'x'.repeat(100),
            assetClasses: ['stock', 'etf'],
            regions: ['europe'],
            countries: ['DE'],
            sectors: [],
            industries: ['software'],
            sizes: ['small'],
            styles: ['growth'],
            dividendYield: { min: 0.01 },
            sort: { key: 'y5', direction: 'desc' },
          },
        }),
      ],
    ])('accepts a command with %s', (_label, message) => {
      expect(isEngineCommandMessage(message)).toBe(true);
    });
  });

  describe('isEngineEventMessage', () => {
    it('accepts every valid event', () => {
      fc.assert(fc.property(arbEvent, (message) => isEngineEventMessage(message)));
    });

    it('never throws on a valid event with one field replaced', () => {
      fc.assert(
        fc.property(
          arbEvent,
          fc.constantFrom(
            'protocol',
            'id',
            'replyTo',
            'payload',
            'tick',
            'quotes',
            'accounts',
            'netWorth',
            'ok',
            'error',
          ),
          fc.anything(),
          fc.boolean(),
          (message, key, value, inPayload) => {
            expect(() =>
              isEngineEventMessage(corrupt(message, key, value, inPayload)),
            ).not.toThrow();
          },
        ),
      );
    });

    it.each([
      [
        'a reply without replyTo',
        { protocol: 1, id: 'w1', type: 'reply', payload: { ok: true, data: null } },
      ],
      [
        'a reply with an unknown error',
        {
          protocol: 1,
          id: 'w1',
          replyTo: 'u1',
          type: 'reply',
          payload: { ok: false, error: 'oops' },
        },
      ],
      [
        'a successful reply without data',
        { protocol: 1, id: 'w1', replyTo: 'u1', type: 'reply', payload: { ok: true } },
      ],
      [
        'a quote with a non-finite price',
        {
          protocol: 1,
          id: 'w1',
          type: 'quotes',
          payload: {
            tick: 1,
            quotes: [
              {
                series: 0,
                last: Number.NaN,
                bid: null,
                ask: null,
                previousClose: 1,
                change: 0,
                changeRatio: 0,
              },
            ],
          },
        },
      ],
      [
        'a clock with an unknown effective speed',
        {
          protocol: 1,
          id: 'w1',
          type: 'clock',
          payload: {
            tick: 1,
            speed: '1h',
            paused: false,
            visible: true,
            backgroundMode: 'realtime',
            effectiveSpeed: 'warp',
            overloaded: false,
            jumping: false,
          },
        },
      ],
      ['a command', { protocol: 1, id: 'u1', type: 'pause', payload: {} }],
      ['a reply payload that is not an object', reply(null)],
      ['ok given as a string', reply({ ok: 'false', error: 'busy' })],
      ['a failure message that is not a string', reply({ ok: false, error: 'busy', message: 3 })],
      ['a fatal without a message', event('fatal', {})],
      ['an unknown warning', event('warning', { code: 'disk-full', message: '' })],
      ['a clock with a string tick', event('clock', { ...CLOCK, tick: '1' })],
      ['a clock with paused as a string', event('clock', { ...CLOCK, paused: 'no' })],
      ['a quote with a string bid', event('quotes', { tick: 1, quotes: [{ ...QUOTE, bid: '1' }] })],
      [
        'movers with an unknown sector',
        event('movers', {
          tick: 1,
          gainers: [],
          losers: [],
          sectors: [{ sectorId: 'space', quote: QUOTE }],
        }),
      ],
      ['movers without losers', event('movers', { tick: 1, gainers: [QUOTE], sectors: [] })],
      [
        'a negative progress',
        event('progress', { kind: 'jump', state: 'running', done: -1, total: 5 }),
      ],
      ['a projection without net worth', projection({ netWorth: undefined })],
      ['a fractional net worth', projection({ netWorth: 0.5 })],
      ['accounts that are not a list', projection({ accounts: ACCOUNT })],
      ['an account of an unknown kind', projection({ accounts: [{ ...ACCOUNT, kind: 'cfd' }] })],
      ['a negative available amount', projection({ accounts: [{ ...ACCOUNT, available: -1 }] })],
      [
        'a depot without number',
        projection({ accounts: [{ ...ACCOUNT, depot: { id: 'dep-3' } }] }),
      ],
      ['an engine error the protocol does not know', reply({ ok: false, error: 'no-money' })],
      ['a notification number 0', notification({ seq: 0 })],
      ['an unknown notification code', notification({ code: 'fire' })],
      ['coverage without balance', notification({ params: { accountId: 'acc-1', limit: 0 } })],
      [
        'nested parameters of a pending code',
        notification({ code: 'order-executed', params: { a: {} } }),
      ],
      [
        'a closed month without values',
        event('notification', {
          tick: 1,
          notifications: [{ ...MONTH_CLOSED, params: { year: 2030, month: 4 } }],
        }),
      ],
      [
        'a clock paused by an unknown code',
        event('clock', { ...CLOCK, autoPause: { seq: 1, code: 'x' } }),
      ],
      [
        'auto-pause settings that miss a code',
        projection({ notifications: { lastSeq: 1, unread: 0, autoPause: {} } }),
      ],
      ['a report without flows', event('report', { from: 0, to: 1 })],
    ])('rejects an event with %s', (_label, message) => {
      expect(isEngineEventMessage(message)).toBe(false);
    });

    it.each([
      ['a failure reply without a message', reply({ ok: false, error: 'busy' })],
      ['a clock at tick 0', event('clock', { ...CLOCK, tick: 0 })],
      ['a storage warning', event('warning', { code: 'storage-failed', message: 'quota' })],
      [
        'progress of the candle job',
        event('progress', { kind: 'candles', state: 'done', done: 3, total: 3 }),
      ],
      ['a quote of series 0 without bid and ask', event('quotes', { tick: 0, quotes: [QUOTE] })],
      ['a projection with a negative net worth', projection({ netWorth: -500 })],
      ['a full projection without accounts', projection({ full: true, accounts: [] })],
      ['a rejected transfer', reply({ ok: false, error: 'insufficient-funds' })],
      [
        'new notifications',
        event('notification', { tick: 1, notifications: [MONTH_CLOSED, UNCOVERED] }),
      ],
      [
        'a clock paused by a notification',
        event('clock', {
          ...CLOCK,
          paused: true,
          autoPause: { seq: 2, code: 'overdraft-limit-exceeded' },
        }),
      ],
      ['a rejected read request', reply({ ok: false, error: 'unknown-notification' })],
    ])('accepts an event with %s', (_label, message) => {
      expect(isEngineEventMessage(message)).toBe(true);
    });
  });

  describe('isEngineEnvelope', () => {
    it('rejects a replyTo that is not a string', () => {
      expect(isEngineEnvelope({ protocol: 1, id: 'w1', replyTo: 7, type: 'x', payload: 1 })).toBe(
        false,
      );
    });
  });

  describe('messageId', () => {
    it.each([
      [{ id: 'u7', type: 'nonsense' }, 'u7'],
      [{ id: '' }, null],
      [{ id: 7 }, null],
      [null, null],
      ['u7', null],
    ])('reads the id of %j as %j', (value, expected) => {
      expect(messageId(value)).toBe(expected);
    });
  });
});
