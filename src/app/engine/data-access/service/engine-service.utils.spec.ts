import fc from 'fast-check';

import { ACCOUNT_KINDS, OPENABLE_ACCOUNT_KINDS } from '@app/banking/domain/models/account.model';
import { TRANSACTION_TYPES } from '@app/banking/domain/models/ledger.model';
import { MAX_STATEMENT_LIMIT } from '@app/banking/domain/models/statement.model';
import { SPEEDS } from '@app/clock/domain/models/speed.model';
import { BACKGROUND_MODES } from '@app/engine/domain/models/game-state.model';

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
  envelope('subscribe', fc.record({ series: fc.array(arbCount) })),
  envelope('unsubscribe', fc.record({ series: fc.array(arbCount) })),
  envelope(
    'query',
    fc.record({
      query: fc.oneof(
        fc.constant({ kind: 'exchanges' as const }),
        fc.constant({ kind: 'banks' as const }),
        fc.constant({ kind: 'monthlyValues' as const }),
        fc.record({ kind: fc.constant('closingPreview' as const), accountId: arbAccountId }),
        arbStatementQuery,
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
    fc.record({
      tick: arbCount,
      speed: arbSpeed,
      paused: fc.boolean(),
      visible: fc.boolean(),
      backgroundMode: arbMode,
      effectiveSpeed: fc.option(arbSpeed, { nil: null }),
      overloaded: fc.boolean(),
      jumping: fc.boolean(),
    }),
  ),
  envelope('quotes', fc.record({ tick: arbCount, quotes: fc.array(arbQuote, { maxLength: 4 }) })),
  envelope(
    'projection',
    fc.record({
      tick: arbCount,
      full: fc.boolean(),
      accounts: fc.array(arbAccountView, { maxLength: 4 }),
      netWorth: arbCents,
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
