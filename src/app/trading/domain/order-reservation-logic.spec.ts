import fc from 'fast-check';

import { DepotConditions } from '@app/banking/domain/models/bank-conditions.model';

import { OrderSpec, OrderStatus } from './models/order.model';
import { orderFill } from './order-execution-logic';
import {
  freeQuantity,
  openSellQuantity,
  orderReservation,
  reservedAmount,
  ReservingOrder,
} from './order-reservation-logic';

import { arbFeeModel } from '../../../testing/arbitraries';

const SHARE = 1_000_000;

/** Branch bank: 0.25 %, min 10 €, max 60 € plus 3 € exchange fee. */
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

type ReservedSpec = Pick<OrderSpec, 'side' | 'type' | 'size' | 'limit' | 'stop'>;

function buy(
  type: OrderSpec['type'],
  shares: number,
  prices: { limit?: number; stop?: number } = {},
): ReservedSpec {
  return {
    side: 'buy',
    type,
    size: { kind: 'quantity', quantity: shares * SHARE },
    limit: prices.limit ?? null,
    stop: prices.stop ?? null,
  };
}

function order(
  depotId: 'dep-1' | 'dep-2',
  instrumentId: string,
  side: 'buy' | 'sell',
  status: OrderStatus,
  quantityOrReserved: number,
): ReservingOrder {
  return side === 'buy'
    ? {
        depotId,
        instrumentId,
        side,
        status,
        size: { kind: 'amount', amount: quantityOrReserved },
        reserved: quantityOrReserved,
      }
    : {
        depotId,
        instrumentId,
        side,
        status,
        size: { kind: 'quantity', quantity: quantityOrReserved },
        reserved: 0,
      };
}

describe('order-reservation-logic', () => {
  describe('orderReservation', () => {
    // TS §7.5, Umsetzung AP 5.1a: ask 100,10 €, branch bank (0,25 %, min 10 €, max 60 €, + 3 €)
    it.each<[string, ReservedSpec, number, number]>([
      ['market 10 shares, 5 % buffer', buy('market', 10), 100.1, 106_405],
      ['market 100 shares, fee above min', buy('market', 100), 100.1, 1_053_978],
      ['market 3 shares at 33,33 €, buffer rounded', buy('market', 3), 33.33, 11_799],
      ['stop 105 above the ask', buy('stop', 10, { stop: 105 }), 100.1, 111_550],
      ['stop 95 below the ask', buy('stop', 10, { stop: 95 }), 100.1, 106_405],
      ['limit 99', buy('limit', 10, { limit: 99 }), 100.1, 100_300],
      ['limit 50, 100 shares', buy('limit', 100, { limit: 50 }), 100.1, 501_550],
      ['stop-limit 101/102', buy('stop-limit', 10, { stop: 101, limit: 102 }), 100.1, 103_300],
      [
        'amount 1.000 €',
        {
          side: 'buy',
          type: 'market',
          size: { kind: 'amount', amount: 100_000 },
          limit: null,
          stop: null,
        },
        100.1,
        100_000,
      ],
      ['sale', { ...buy('market', 10), side: 'sell' }, 100.1, 0],
    ])('reserves for %s', (_case, spec, ask, expected) => {
      expect(orderReservation(spec, ask, BRANCH)).toBe(expected);
    });

    it('throws for a stop or limit order without its price', () => {
      expect(() => orderReservation(buy('stop', 1), 100, BRANCH)).toThrow('needs a stop');
      expect(() => orderReservation(buy('limit', 1), 100, BRANCH)).toThrow('needs a limit');
    });

    it('covers the debit of a limit purchase at any ask up to the limit', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1_000 * SHARE }),
          fc.integer({ min: 1, max: 10_000_000 }),
          fc.integer({ min: 1, max: 10_000_000 }),
          arbFeeModel().filter((model) => model.kind !== 'tiered'),
          fc.integer({ min: 0, max: 1_000 }),
          (quantity, limitSteps, askSteps, orderFee, exchangeFee) => {
            fc.pre(askSteps <= limitSteps);
            const conditions = { ...BRANCH, orderFee, exchangeFee };
            const spec: ReservedSpec = {
              side: 'buy',
              type: 'limit',
              size: { kind: 'quantity', quantity },
              limit: limitSteps / 10_000,
              stop: null,
            };
            const fill = orderFill(spec, askSteps / 10_000, conditions);
            expect(orderReservation(spec, askSteps / 10_000, conditions)).toBeGreaterThanOrEqual(
              fill.total,
            );
          },
        ),
      );
    });
  });

  describe('reservedAmount', () => {
    // TS §7.5, Umsetzung AP 5.1a: only active purchases of the depot reserve money
    it('sums the reservations of the active purchases of a depot', () => {
      const orders = [
        order('dep-1', 'a', 'buy', 'open', 10_000),
        order('dep-1', 'a', 'buy', 'triggered', 20_000),
        order('dep-1', 'b', 'buy', 'executed', 40_000),
        order('dep-1', 'b', 'buy', 'cancelled', 80_000),
        order('dep-1', 'a', 'sell', 'open', SHARE),
        order('dep-2', 'a', 'buy', 'open', 160_000),
      ];
      expect(reservedAmount(orders, 'dep-1')).toBe(30_000);
      expect(reservedAmount(orders, 'dep-2')).toBe(160_000);
    });
  });

  describe('freeQuantity', () => {
    // TS §7.5, Umsetzung AP 5.1a: holding 10 shares of `a` in `dep-1`
    it('subtracts the shares in active sell orders of the instrument in the depot', () => {
      const orders: ReservingOrder[] = [
        order('dep-1', 'a', 'sell', 'open', 2 * SHARE),
        order('dep-1', 'a', 'sell', 'triggered', 1_500_000),
        order('dep-1', 'a', 'sell', 'cancelled', 3 * SHARE),
        order('dep-1', 'a', 'sell', 'expired', 3 * SHARE),
        order('dep-1', 'a', 'buy', 'open', 4 * SHARE),
        {
          ...order('dep-1', 'a', 'buy', 'open', 0),
          size: { kind: 'quantity', quantity: 7 * SHARE },
        },
        order('dep-1', 'b', 'sell', 'open', 5 * SHARE),
        order('dep-2', 'a', 'sell', 'open', 6 * SHARE),
      ];
      expect(openSellQuantity(orders, 'dep-1', 'a')).toBe(3_500_000);
      expect(freeQuantity(10 * SHARE, orders, 'dep-1', 'a')).toBe(6_500_000);
    });
  });
});
