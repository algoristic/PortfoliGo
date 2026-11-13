import { DepotConditions } from '@app/banking/domain/models/bank-conditions.model';
import { dateTimeToTick } from '@app/clock/domain/calendar-logic';

import { Order, OrderChange, OrderSpec } from './models/order.model';
import {
  changedReservation,
  freeFunds,
  isAtPriceFloor,
  OrderChangeContext,
  orderChangeError,
  OrderPlacementContext,
  orderPlacementError,
} from './order-command-logic';

const SHARE = 1_000_000;
const MONDAY_10 = dateTimeToTick({ year: 2030, month: 4, day: 1, hour: 10 });

/** Branch bank: 0.25 %, min 10 €, max 60 € plus 3 € exchange fee, whole shares only. */
const BRANCH: DepotConditions = {
  custodyFee: { kind: 'none' },
  orderFee: { kind: 'percent', rate: 0.0025, min: 1_000, max: 6_000 },
  exchangeFee: 300,
  savingsPlanFee: { kind: 'free' },
  clearingAccountRate: 0,
  clearingAccountDebitRate: 0,
  venue: 'exchange',
  spreadMarkup: 0,
  fractionalShares: false,
};

const BUY_MARKET: OrderSpec = {
  depotId: 'dep-2',
  instrumentId: 'i-7',
  side: 'buy',
  type: 'market',
  size: { kind: 'quantity', quantity: 10 * SHARE },
  limit: null,
  stop: null,
  validity: { kind: 'day' },
};

/** Free money 1.500,00 €, 5 free shares, quote 99,90 € / 100,10 €. */
const PLACEMENT: OrderPlacementContext = {
  tick: MONDAY_10,
  conditions: BRANCH,
  quote: { bid: 99.9, ask: 100.1 },
  atPriceFloor: false,
  clearingBalance: 200_000,
  reserved: 50_000,
  freeQuantity: 5 * SHARE,
};

function shares(quantity: number): Pick<OrderSpec, 'size'> {
  return { size: { kind: 'quantity', quantity } };
}

const SELL = { side: 'sell' } as const;

describe('order-command-logic', () => {
  describe('orderPlacementError', () => {
    // TS §7.5, Umsetzung AP 5.1a: codes when placing an order
    it.each<[string, Partial<OrderSpec>, Partial<OrderPlacementContext>, string | null]>([
      ['market purchase of 10 shares', {}, {}, null],
      ['an index', {}, { quote: null }, 'instrument-not-tradable'],
      ['0 shares', shares(0), {}, 'invalid-quantity'],
      ['−1 share', shares(-SHARE), {}, 'invalid-quantity'],
      ['half a millionth', shares(0.5), {}, 'invalid-quantity'],
      ['1,5 shares without fractions', shares(1_500_000), {}, 'fractional-not-allowed'],
      [
        '1,5 shares with fractions',
        shares(1_500_000),
        { conditions: { ...BRANCH, fractionalShares: true } },
        null,
      ],
      ['sale of 1,5 shares without fractions', { ...SELL, ...shares(1_500_000) }, {}, null],
      ['sale of 5 shares', { ...SELL, ...shares(5 * SHARE) }, {}, null],
      [
        'sale of 5,000001 shares',
        { ...SELL, ...shares(5 * SHARE + 1) },
        {},
        'insufficient-quantity',
      ],
      [
        'sale at the price floor',
        { ...SELL, ...shares(SHARE) },
        { atPriceFloor: true, clearingBalance: -1 },
        null,
      ],
      [
        'sale by amount',
        { ...SELL, size: { kind: 'amount', amount: 10_000 } },
        {},
        'amount-only-for-buy',
      ],
      ['amount 0', { size: { kind: 'amount', amount: 0 } }, {}, 'invalid-amount'],
      ['amount 10,005 €', { size: { kind: 'amount', amount: 1_000.5 } }, {}, 'invalid-amount'],
      ['amount 1.500,00 €', { size: { kind: 'amount', amount: 150_000 } }, {}, null],
      [
        'amount 1.500,01 €',
        { size: { kind: 'amount', amount: 150_001 } },
        {},
        'insufficient-funds',
      ],
      ['limit order without limit', { type: 'limit' }, {}, 'invalid-limit'],
      ['limit 0', { type: 'limit', limit: 0 }, {}, 'invalid-limit'],
      ['limit −1', { type: 'limit', limit: -1 }, {}, 'invalid-limit'],
      ['infinite limit', { type: 'limit', limit: Number.POSITIVE_INFINITY }, {}, 'invalid-limit'],
      ['market order with limit', { limit: 100 }, {}, 'invalid-limit'],
      ['limit order with stop', { type: 'limit', limit: 99, stop: 98 }, {}, 'invalid-stop'],
      ['stop order without stop', { type: 'stop' }, {}, 'invalid-stop'],
      ['stop 0', { type: 'stop', stop: 0 }, {}, 'invalid-stop'],
      ['market order with stop', { stop: 100 }, {}, 'invalid-stop'],
      ['stop order with limit', { type: 'stop', stop: 101, limit: 102 }, {}, 'invalid-limit'],
      ['stop-limit without stop', { type: 'stop-limit', limit: 102 }, {}, 'invalid-stop'],
      ['stop-limit 101/102', { type: 'stop-limit', stop: 101, limit: 102 }, {}, null],
      [
        'date yesterday',
        { validity: { kind: 'date', date: { year: 2030, month: 3, day: 31 } } },
        {},
        'invalid-validity',
      ],
      [
        'date in a year and a day',
        { validity: { kind: 'date', date: { year: 2031, month: 4, day: 2 } } },
        {},
        'validity-too-long',
      ],
      ['purchase at the price floor', {}, { atPriceFloor: true }, 'price-floor'],
      [
        'negative clearing account',
        shares(SHARE),
        { clearingBalance: -1 },
        'clearing-account-negative',
      ],
      [
        'clearing account at 0',
        { size: { kind: 'amount', amount: 1 } },
        { clearingBalance: 0, reserved: 0 },
        'insufficient-funds',
      ],
      ['14 shares, reservation 1.484,47 €', shares(14 * SHARE), {}, null],
      ['15 shares, reservation 1.589,58 €', shares(15 * SHARE), {}, 'insufficient-funds'],
    ])('checks %s', (_case, spec, context, expected) => {
      expect(orderPlacementError({ ...BUY_MARKET, ...spec }, { ...PLACEMENT, ...context })).toBe(
        expected,
      );
    });
  });

  describe('orderChangeError', () => {
    const LIMIT_ORDER: Order = {
      ...BUY_MARKET,
      id: 'ord-1',
      type: 'limit',
      limit: 99,
      status: 'open',
      placedAt: MONDAY_10,
      expiresAt: MONDAY_10 + 450,
      reserved: 100_300,
      triggeredAt: null,
      execution: null,
      closedAt: null,
      rejection: null,
    };
    const STOP_LIMIT: Order = {
      ...LIMIT_ORDER,
      type: 'stop-limit',
      stop: 101,
      limit: 102,
      reserved: 103_300,
    };
    /** Free money 497,00 €: balance 2.000,00 €, reservations 1.503,00 € including the order's 1.003,00 €. */
    const CHANGE: OrderChangeContext = {
      tick: MONDAY_10 + 60,
      conditions: BRANCH,
      ask: 100.1,
      clearingBalance: 200_000,
      reserved: 150_300,
    };

    // TS §7.5, Umsetzung AP 5.1a: codes when changing an order (US-HD-04)
    it.each<[string, Order, OrderChange, string | null]>([
      ['limit 100 (reservation +10,00 €)', LIMIT_ORDER, { limit: 100 }, null],
      ['limit 148 (reservation +490,00 €)', LIMIT_ORDER, { limit: 148 }, null],
      ['limit 148,70 (reservation +497,00 €, all free money)', LIMIT_ORDER, { limit: 148.7 }, null],
      ['limit 149 (reservation +500,00 €)', LIMIT_ORDER, { limit: 149 }, 'insufficient-funds'],
      ['limit 0', LIMIT_ORDER, { limit: 0 }, 'invalid-limit'],
      ['stop on a limit order', LIMIT_ORDER, { stop: 95 }, 'invalid-stop'],
      [
        'validity yesterday',
        LIMIT_ORDER,
        { validity: { kind: 'date', date: { year: 2030, month: 3, day: 31 } } },
        'invalid-validity',
      ],
      ['validity gtc', LIMIT_ORDER, { validity: { kind: 'gtc' } }, null],
      [
        'an executed order',
        { ...LIMIT_ORDER, status: 'executed' },
        { limit: 100 },
        'order-not-active',
      ],
      [
        'a cancelled order',
        { ...LIMIT_ORDER, status: 'cancelled' },
        { validity: { kind: 'gtc' } },
        'order-not-active',
      ],
      ['the stop of an open stop-limit order', STOP_LIMIT, { stop: 100 }, null],
      [
        'the stop of a triggered stop-limit order',
        { ...STOP_LIMIT, status: 'triggered' },
        { stop: 100 },
        'stop-triggered',
      ],
      [
        'the limit of a triggered stop-limit order',
        { ...STOP_LIMIT, status: 'triggered' },
        { limit: 103 },
        null,
      ],
      [
        'a sale above the free money',
        { ...LIMIT_ORDER, side: 'sell', reserved: 0 },
        { limit: 500 },
        null,
      ],
    ])('checks %s', (_case, order, change, expected) => {
      expect(orderChangeError(order, change, CHANGE)).toBe(expected);
    });

    it('keeps the reservation when only the validity changes and recomputes it for new prices', () => {
      const market: Order = { ...LIMIT_ORDER, type: 'market', limit: null, reserved: 99_999 };
      expect(changedReservation(market, { validity: { kind: 'gtc' } }, 100.1, BRANCH)).toBe(99_999);
      expect(changedReservation(LIMIT_ORDER, { limit: 100 }, 100.1, BRANCH)).toBe(101_300);
      expect(changedReservation(STOP_LIMIT, { stop: 100 }, 100.1, BRANCH)).toBe(103_300);
      const stop: Order = {
        ...LIMIT_ORDER,
        type: 'stop',
        limit: null,
        stop: 105,
        reserved: 111_550,
      };
      expect(changedReservation(stop, { stop: 110 }, 100.1, BRANCH)).toBe(116_800);
    });
  });

  describe('freeFunds', () => {
    it.each([
      [200_000, 50_000, 150_000],
      [-10_000, 0, 0],
      [10_000, 30_000, -20_000],
    ])('leaves %d cents minus %d reserved: %d', (balance, reserved, expected) => {
      expect(freeFunds(balance, reserved)).toBe(expected);
    });
  });

  describe('isAtPriceFloor', () => {
    it.each([
      [0.01, true],
      [0.0101, false],
      [0.0099, true],
    ])('tells whether %d € is at the floor of 0,01 €', (price, expected) => {
      expect(isAtPriceFloor(price, 0.01)).toBe(expected);
    });
  });
});
