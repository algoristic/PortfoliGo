import fc from 'fast-check';

import { DepotConditions, FeeModel } from '@app/banking/domain/models/bank-conditions.model';

import { Order, OrderDecision, OrderSide, OrderType } from './models/order.model';
import {
  amountOrderQuantity,
  DecidableOrder,
  executionError,
  executionTransaction,
  midRulesOutExecution,
  orderDecision,
  orderFill,
} from './order-execution-logic';

import { arbFeeModel } from '../../../testing/arbitraries';

const SHARE = 1_000_000;

function depot(
  orderFee: FeeModel,
  exchangeFee: number,
  fractionalShares: boolean,
): DepotConditions {
  return {
    custodyFee: { kind: 'none' },
    orderFee,
    exchangeFee,
    savingsPlanFee: { kind: 'free' },
    clearingAccountRate: 0,
    clearingAccountDebitRate: 0,
    venue: 'exchange',
    spreadMarkup: 0,
    fractionalShares,
  };
}

/** Branch bank: 0.25 %, min 10 €, max 60 € plus 3 € exchange fee, whole shares only. */
const BRANCH = depot({ kind: 'percent', rate: 0.0025, min: 1_000, max: 6_000 }, 300, false);
/** Neo broker: 0.90 € flat, fractions. */
const NEO = depot({ kind: 'flat', amount: 90 }, 0, true);
const NEO_WHOLE = { ...NEO, fractionalShares: false };
/** Direct bank: 4.90 € + 0.25 %, max 69.90 €, fractions. */
const DIRECT = depot({ kind: 'flat-plus-percent', amount: 490, rate: 0.0025, max: 6_990 }, 0, true);
const FLAT_490 = depot({ kind: 'flat', amount: 490 }, 0, false);

function decidable(
  side: OrderSide,
  type: OrderType,
  prices: { limit?: number; stop?: number } = {},
  status: 'open' | 'triggered' = 'open',
): DecidableOrder {
  return { side, type, limit: prices.limit ?? null, stop: prices.stop ?? null, status };
}

const QUOTE = { bid: 99.9, ask: 100.1 };
const GAP_OPENING = { bid: 90, ask: 90.1 };

describe('order-execution-logic', () => {
  describe('midRulesOutExecution', () => {
    it.each<[string, DecidableOrder, number, boolean]>([
      ['a buy limit 100 at mid 100,01', decidable('buy', 'limit', { limit: 100 }), 100.01, true],
      ['a buy limit 100 at mid 100', decidable('buy', 'limit', { limit: 100 }), 100, false],
      ['a sell limit 100 at mid 99,99', decidable('sell', 'limit', { limit: 100 }), 99.99, true],
      ['a sell limit 100 at mid 100', decidable('sell', 'limit', { limit: 100 }), 100, false],
      [
        'a triggered buy stop-limit 99 / 100 at mid 101',
        decidable('buy', 'stop-limit', { stop: 99, limit: 100 }, 'triggered'),
        101,
        true,
      ],
      [
        'a triggered sell stop-limit 101 / 100 at mid 99',
        decidable('sell', 'stop-limit', { stop: 101, limit: 100 }, 'triggered'),
        99,
        true,
      ],
      [
        'an open buy stop-limit 101 / 100 at mid 101',
        decidable('buy', 'stop-limit', { stop: 101, limit: 100 }),
        101,
        false,
      ],
      ['a buy stop 101 at mid 50', decidable('buy', 'stop', { stop: 101 }), 50, false],
      ['a market sale at mid 50', decidable('sell', 'market'), 50, false],
    ])('tells for %s: %s', (_case, order, mid, expected) => {
      expect(midRulesOutExecution(order, mid)).toBe(expected);
    });

    it('rules out only what orderDecision decides as nothing for any bid ≤ mid ≤ ask', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<OrderSide>('buy', 'sell'),
          fc.constantFrom<OrderType>('market', 'limit', 'stop', 'stop-limit'),
          fc.constantFrom<'open' | 'triggered'>('open', 'triggered'),
          fc.integer({ min: 9_000, max: 11_000 }),
          fc.integer({ min: 9_000, max: 11_000 }),
          fc.integer({ min: 0, max: 200 }),
          fc.integer({ min: 0, max: 200 }),
          fc.integer({ min: 9_000, max: 11_000 }),
          (side, type, status, limit, stop, below, above, mid) => {
            const order = decidable(
              side,
              type,
              {
                limit: type === 'limit' || type === 'stop-limit' ? limit / 100 : undefined,
                stop: type === 'stop' || type === 'stop-limit' ? stop / 100 : undefined,
              },
              type === 'stop' || type === 'stop-limit' ? status : 'open',
            );
            const quote = { bid: (mid - below) / 100, ask: (mid + above) / 100 };
            if (midRulesOutExecution(order, mid / 100)) {
              expect(orderDecision(order, quote)).toEqual({ kind: 'none' });
            }
          },
        ),
      );
    });
  });

  describe('orderDecision', () => {
    // TS §7.5: table of order types, quote bid 99,90 € / ask 100,10 €
    it.each<[string, DecidableOrder, { bid: number; ask: number }, OrderDecision]>([
      [
        'buy market',
        decidable('buy', 'market'),
        QUOTE,
        { kind: 'execute', price: 100.1, triggered: false },
      ],
      [
        'sell market',
        decidable('sell', 'market'),
        QUOTE,
        { kind: 'execute', price: 99.9, triggered: false },
      ],
      [
        'buy limit at the ask',
        decidable('buy', 'limit', { limit: 100.1 }),
        QUOTE,
        { kind: 'execute', price: 100.1, triggered: false },
      ],
      [
        'buy limit below the ask',
        decidable('buy', 'limit', { limit: 100 }),
        QUOTE,
        { kind: 'none' },
      ],
      [
        'sell limit at the bid',
        decidable('sell', 'limit', { limit: 99.9 }),
        QUOTE,
        { kind: 'execute', price: 99.9, triggered: false },
      ],
      [
        'sell limit above the bid',
        decidable('sell', 'limit', { limit: 100 }),
        QUOTE,
        { kind: 'none' },
      ],
      [
        'buy stop reached',
        decidable('buy', 'stop', { stop: 100.1 }),
        QUOTE,
        { kind: 'execute', price: 100.1, triggered: true },
      ],
      ['buy stop not reached', decidable('buy', 'stop', { stop: 100.5 }), QUOTE, { kind: 'none' }],
      [
        'sell stop reached',
        decidable('sell', 'stop', { stop: 99.9 }),
        QUOTE,
        { kind: 'execute', price: 99.9, triggered: true },
      ],
      ['sell stop not reached', decidable('sell', 'stop', { stop: 99 }), QUOTE, { kind: 'none' }],
      [
        'buy stop-limit, stop reached, limit not',
        decidable('buy', 'stop-limit', { stop: 100, limit: 100.05 }),
        QUOTE,
        { kind: 'triggered' },
      ],
      [
        'buy stop-limit, both reached',
        decidable('buy', 'stop-limit', { stop: 100, limit: 100.2 }),
        QUOTE,
        { kind: 'execute', price: 100.1, triggered: true },
      ],
      [
        'buy stop-limit, stop not reached',
        decidable('buy', 'stop-limit', { stop: 101, limit: 102 }),
        QUOTE,
        { kind: 'none' },
      ],
      [
        'buy stop-limit triggered, within limit',
        decidable('buy', 'stop-limit', { stop: 101, limit: 100.2 }, 'triggered'),
        QUOTE,
        { kind: 'execute', price: 100.1, triggered: false },
      ],
      [
        'buy stop-limit triggered, above limit',
        decidable('buy', 'stop-limit', { stop: 99, limit: 100 }, 'triggered'),
        QUOTE,
        { kind: 'none' },
      ],
      [
        'sell stop-limit, both reached',
        decidable('sell', 'stop-limit', { stop: 100, limit: 99.5 }),
        QUOTE,
        { kind: 'execute', price: 99.9, triggered: true },
      ],
      [
        'sell stop-limit, stop reached, limit not',
        decidable('sell', 'stop-limit', { stop: 100, limit: 99.95 }),
        QUOTE,
        { kind: 'triggered' },
      ],
      [
        'sell stop-limit triggered, below limit',
        decidable('sell', 'stop-limit', { stop: 100, limit: 99.95 }, 'triggered'),
        QUOTE,
        { kind: 'none' },
      ],
      [
        'stop loss 95 at an opening gap',
        decidable('sell', 'stop', { stop: 95 }),
        GAP_OPENING,
        { kind: 'execute', price: 90, triggered: true },
      ],
      [
        'stop-limit 95/94 at an opening gap',
        decidable('sell', 'stop-limit', { stop: 95, limit: 94 }),
        GAP_OPENING,
        { kind: 'triggered' },
      ],
    ])('decides %s', (_case, order, quote, expected) => {
      expect(orderDecision(order, quote)).toEqual(expected);
    });

    it('throws for a stop or limit order without its price', () => {
      expect(() => orderDecision(decidable('buy', 'stop'), QUOTE)).toThrow('needs a stop');
      expect(() => orderDecision(decidable('buy', 'limit'), QUOTE)).toThrow('needs a limit');
    });

    it('executes limit purchases at most at the limit and limit sales at least at it', () => {
      fc.assert(
        fc.property(
          arbQuote(),
          arbPrice(),
          fc.constantFrom<OrderSide>('buy', 'sell'),
          (quote, limit, side) => {
            const decision = orderDecision(decidable(side, 'limit', { limit }), quote);
            const price = side === 'buy' ? quote.ask : quote.bid;
            const fills = side === 'buy' ? price <= limit : price >= limit;
            expect(decision.kind).toBe(fills ? 'execute' : 'none');
            if (decision.kind === 'execute') {
              expect(decision.price).toBe(price);
            }
          },
        ),
      );
    });

    it('never executes an open stop purchase below its stop or a stop sale above it', () => {
      fc.assert(
        fc.property(
          arbQuote(),
          arbPrice(),
          fc.constantFrom<OrderSide>('buy', 'sell'),
          (quote, stop, side) => {
            const decision = orderDecision(decidable(side, 'stop', { stop }), quote);
            if (decision.kind === 'execute') {
              expect(decision.triggered).toBe(true);
              expect(side === 'buy' ? decision.price >= stop : decision.price <= stop).toBe(true);
            } else {
              expect(decision.kind).toBe('none');
            }
          },
        ),
      );
    });
  });

  describe('amountOrderQuantity', () => {
    // TS §7.5, Umsetzung AP 5.1a: orders by amount
    it.each<[string, number, number, DepotConditions, number]>([
      ['flat 0,90 €, fractions', 100_000, 33.33, NEO, 29_975_997],
      ['flat 0,90 €, whole shares', 100_000, 33.33, NEO_WHOLE, 29 * SHARE],
      ['4,90 € + 0,25 %, fractions', 100_000, 50, DIRECT, 19_852_400],
      ['0,25 % min 10 € + 3 €, whole shares', 1_000_000, 100.1, BRANCH, 99 * SHARE],
      ['flat 4,90 €, 5 €, whole shares', 500, 100, FLAT_490, 0],
      ['flat 4,90 €, 5 €, fractions', 500, 100, { ...FLAT_490, fractionalShares: true }, 1_000],
      ['flat 4,90 €, amount below the fee', 400, 100, { ...FLAT_490, fractionalShares: true }, 0],
    ])('buys with %s', (_case, amount, price, conditions, expected) => {
      expect(amountOrderQuantity(amount, price, conditions)).toBe(expected);
    });

    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('throws for the price %d', (price) => {
      expect(() => amountOrderQuantity(100_000, price, NEO)).toThrow('invalid price');
    });

    it('buys the most shares whose exact market value plus costs stay within the amount', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10_000_000 }),
          arbPriceTenThousandths(),
          arbFeeModel(),
          fc.integer({ min: 0, max: 1_000 }),
          fc.boolean(),
          (amount, priceSteps, orderFee, exchangeFee, fractionalShares) => {
            const conditions = depot(orderFee, exchangeFee, fractionalShares);
            const price = priceSteps / 10_000;
            const quantity = amountOrderQuantity(amount, price, conditions);
            const step = fractionalShares ? 1 : SHARE;
            expect(quantity % step).toBe(0);
            // Independent oracle in integers: quantity × price ≤ amount − costs ⇔
            // quantity · priceSteps ≤ (amount − costs) · 10⁸ (millionths times ten-thousandths of a euro).
            const fits = (q: number): boolean => {
              const costs = orderFill(
                { side: 'buy', size: { kind: 'quantity', quantity: q } },
                price,
                conditions,
              );
              const budget = BigInt(amount - (costs.total - costs.marketValue));
              return BigInt(q) * BigInt(priceSteps) <= budget * 100_000_000n;
            };
            if (quantity > 0) {
              expect(fits(quantity)).toBe(true);
              const fill = orderFill(
                { side: 'buy', size: { kind: 'amount', amount } },
                price,
                conditions,
              );
              expect(fill.total).toBeLessThanOrEqual(amount);
            }
            expect(fits(quantity + step)).toBe(false);
          },
        ),
      );
    });
  });

  describe('orderFill', () => {
    // TS §7.2: purchase of 10 shares at 100 € with 5,90 € order fee
    it('buys 10 shares at 100 € with a flat fee of 5,90 €', () => {
      const conditions = depot({ kind: 'flat', amount: 590 }, 0, false);
      expect(
        orderFill(
          { side: 'buy', size: { kind: 'quantity', quantity: 10 * SHARE } },
          100,
          conditions,
        ),
      ).toEqual({
        quantity: 10 * SHARE,
        price: 100,
        marketValue: 100_000,
        orderFee: 590,
        exchangeFee: 0,
        total: 100_590,
      });
    });

    // TS §7.5, Umsetzung AP 5.1a: executions with the branch bank (0,25 %, min 10 €, max 60 €, + 3 €)
    it.each<[string, OrderSide, number, number, number, number, number]>([
      ['buys 10 at 100,00 €', 'buy', 10 * SHARE, 100, 100_000, 1_000, 101_300],
      ['sells 10 at 99,90 €', 'sell', 10 * SHARE, 99.9, 99_900, 1_000, 98_600],
      ['buys 100 at 50,00 €', 'buy', 100 * SHARE, 50, 500_000, 1_250, 501_550],
      ['sells 0,5 at 3,335 €', 'sell', SHARE / 2, 3.335, 167, 1_000, -1_133],
    ])('%s', (_case, side, quantity, price, value, orderFee, total) => {
      expect(orderFill({ side, size: { kind: 'quantity', quantity } }, price, BRANCH)).toEqual({
        quantity,
        price,
        marketValue: value,
        orderFee,
        exchangeFee: 300,
        total,
      });
    });

    it('computes the shares of an order by amount at execution', () => {
      expect(
        orderFill({ side: 'buy', size: { kind: 'amount', amount: 100_000 } }, 50, DIRECT),
      ).toEqual({
        quantity: 19_852_400,
        price: 50,
        marketValue: 99_262,
        orderFee: 738,
        exchangeFee: 0,
        total: 100_000,
      });
    });
  });

  describe('executionError', () => {
    const buyFill = orderFill(
      { side: 'buy', size: { kind: 'quantity', quantity: 10 * SHARE } },
      100,
      BRANCH,
    );
    const context = {
      atPriceFloor: false,
      clearingBalance: 151_300,
      reserved: 150_300,
      holding: 0,
    };

    // TS §7.5, Umsetzung AP 5.1a: reservation of the order 1.003,00 €, other reservations 500,00 €
    it.each<[string, Partial<typeof context>, string | null]>([
      ['covered exactly', {}, null],
      ['one cent short', { clearingBalance: 151_299 }, 'insufficient-funds'],
      [
        'negative clearing account',
        { clearingBalance: -100, reserved: 100_300 },
        'insufficient-funds',
      ],
      ['at the price floor', { atPriceFloor: true }, 'price-floor'],
    ])('checks a purchase of 1.013,00 €: %s', (_case, changes, expected) => {
      expect(
        executionError({ side: 'buy', reserved: 100_300 }, buyFill, { ...context, ...changes }),
      ).toBe(expected);
    });

    it('rejects an order by amount that buys nothing', () => {
      const fill = orderFill({ side: 'buy', size: { kind: 'amount', amount: 500 } }, 100, FLAT_490);
      expect(
        executionError({ side: 'buy', reserved: 500 }, fill, { ...context, reserved: 500 }),
      ).toBe('amount-too-small');
    });

    it.each([
      [10 * SHARE, null],
      [9_500_000, 'insufficient-quantity'],
    ])('checks a sale of 10 shares with a holding of %d', (holding, expected) => {
      const fill = orderFill(
        { side: 'sell', size: { kind: 'quantity', quantity: 10 * SHARE } },
        99.9,
        BRANCH,
      );
      expect(
        executionError({ side: 'sell', reserved: 0 }, fill, {
          ...context,
          atPriceFloor: true,
          holding,
        }),
      ).toBe(expected);
    });
  });

  describe('executionTransaction', () => {
    const order: Pick<Order, 'id' | 'depotId' | 'instrumentId' | 'side'> = {
      id: 'ord-1',
      depotId: 'dep-2',
      instrumentId: 'i-7',
      side: 'buy',
    };
    const accounts = { clearingAccountId: 'acc-3', bankId: 'b1' } as const;

    // TS §7.5, Umsetzung AP 5.1a: bookings of an execution
    it('books a purchase against the market and the bank', () => {
      const fill = orderFill(
        { side: 'buy', size: { kind: 'quantity', quantity: 10 * SHARE } },
        100,
        BRANCH,
      );
      expect(executionTransaction(order, fill, accounts, 1_234)).toEqual({
        tick: 1_234,
        type: 'buy',
        postings: [
          { account: 'acc-3', amount: -101_300 },
          { account: 'external:market', amount: 100_000 },
          { account: 'external:bank:b1:fees', amount: 1_300 },
        ],
        units: [{ depotId: 'dep-2', instrumentId: 'i-7', quantity: 10 * SHARE }],
        refs: { orderId: 'ord-1', instrumentId: 'i-7' },
        params: {
          quantity: 10 * SHARE,
          price: 100,
          marketValue: 100_000,
          orderFee: 1_000,
          exchangeFee: 300,
        },
      });
    });

    it('books a sale and leaves out fees of 0', () => {
      const fill = orderFill(
        { side: 'sell', size: { kind: 'quantity', quantity: 2_500_000 } },
        40,
        NEO,
      );
      const transaction = executionTransaction({ ...order, side: 'sell' }, fill, accounts, 1_234);
      expect(transaction.type).toBe('sell');
      expect(transaction.postings).toEqual([
        { account: 'acc-3', amount: 9_910 },
        { account: 'external:market', amount: -10_000 },
        { account: 'external:bank:b1:fees', amount: 90 },
      ]);
      expect(transaction.units).toEqual([
        { depotId: 'dep-2', instrumentId: 'i-7', quantity: -2_500_000 },
      ]);
    });

    it('books the exchange fee as a bank fee when the order fee is 0', () => {
      const conditions = depot({ kind: 'free' }, 200, false);
      const fill = orderFill(
        { side: 'buy', size: { kind: 'quantity', quantity: SHARE } },
        10,
        conditions,
      );
      expect(executionTransaction(order, fill, accounts, 0).postings).toEqual([
        { account: 'acc-3', amount: -1_200 },
        { account: 'external:market', amount: 1_000 },
        { account: 'external:bank:b1:fees', amount: 200 },
      ]);
    });

    it('leaves out the fee posting when both fees are 0', () => {
      const conditions = depot({ kind: 'free' }, 0, false);
      const fill = orderFill(
        { side: 'buy', size: { kind: 'quantity', quantity: SHARE } },
        10,
        conditions,
      );
      expect(executionTransaction(order, fill, accounts, 0).postings).toEqual([
        { account: 'acc-3', amount: -1_000 },
        { account: 'external:market', amount: 1_000 },
      ]);
    });

    it('balances every booking to zero', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<OrderSide>('buy', 'sell'),
          fc.integer({ min: 1, max: 1_000 * SHARE }),
          arbPriceTenThousandths(),
          arbFeeModel(),
          fc.integer({ min: 0, max: 1_000 }),
          (side, quantity, priceSteps, orderFee, exchangeFee) => {
            const fill = orderFill(
              { side, size: { kind: 'quantity', quantity } },
              priceSteps / 10_000,
              depot(orderFee, exchangeFee, true),
            );
            const transaction = executionTransaction({ ...order, side }, fill, accounts, 0);
            expect(transaction.postings.reduce((sum, { amount }) => sum + amount, 0)).toBe(0);
          },
        ),
      );
    });
  });
});

function arbPriceTenThousandths(): fc.Arbitrary<number> {
  return fc.integer({ min: 1, max: 100_000_000 });
}

function arbPrice(): fc.Arbitrary<number> {
  return arbPriceTenThousandths().map((steps) => steps / 10_000);
}

function arbQuote(): fc.Arbitrary<{ bid: number; ask: number }> {
  return fc
    .tuple(arbPriceTenThousandths(), fc.integer({ min: 1, max: 10_000 }))
    .map(([bid, spread]) => ({ bid: bid / 10_000, ask: (bid + spread) / 10_000 }));
}
