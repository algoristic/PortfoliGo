import fc from 'fast-check';

import { SPEEDS } from '@app/clock/domain/models/speed.model';
import { BACKGROUND_MODES } from '@app/engine/domain/models/game-state.model';

import {
  ENGINE_ERRORS,
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
    fc.record({
      playerId: arbId,
      seed: fc.string(),
      start: fc.record({ startCapital: arbCount, netIncome: arbCount, livingCosts: arbCount }),
    }),
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
  envelope('query', fc.constant({ query: { kind: 'exchanges' as const } })),
  envelope('setBackgroundMode', fc.record({ mode: arbMode })),
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
      ['a visibility that is not a boolean', command('setVisibility', { visible: 'yes' })],
      ['unsubscribe without a series list', command('unsubscribe', { series: 3 })],
      ['series given as strings', command('subscribe', { series: ['1'] })],
      ['a jump target that is not an object', command('jumpTo', { target: null })],
      ['an unknown jump target', command('jumpTo', { target: { kind: 'tomorrow' } })],
      ['a payload that is not an object', command('pause', null)],
    ])('rejects a command with %s', (_label, message) => {
      expect(isEngineCommandMessage(message)).toBe(false);
    });

    it.each([
      ['series 0', command('subscribe', { series: [0] })],
      ['a jump to tick 0', command('jumpTo', { target: { kind: 'date', tick: 0 } })],
      ['zero start conditions', loadPlayer({})],
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
          fc.constantFrom('protocol', 'id', 'replyTo', 'payload', 'tick', 'quotes', 'ok', 'error'),
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
      ['a clock with a string tick', event('clock', { ...CLOCK, tick: '1' })],
      ['a clock with paused as a string', event('clock', { ...CLOCK, paused: 'no' })],
      ['a quote with a string bid', event('quotes', { tick: 1, quotes: [{ ...QUOTE, bid: '1' }] })],
      [
        'a negative progress',
        event('progress', { kind: 'jump', state: 'running', done: -1, total: 5 }),
      ],
    ])('rejects an event with %s', (_label, message) => {
      expect(isEngineEventMessage(message)).toBe(false);
    });

    it.each([
      ['a failure reply without a message', reply({ ok: false, error: 'busy' })],
      ['a clock at tick 0', event('clock', { ...CLOCK, tick: 0 })],
      ['a quote of series 0 without bid and ask', event('quotes', { tick: 0, quotes: [QUOTE] })],
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
