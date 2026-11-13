import fc from 'fast-check';

import { DepotConditions } from '@app/banking/domain/models/bank-conditions.model';
import { bidAsk } from '@app/shared/domain/price-step-logic';
import { TaxYear } from '@app/taxes/domain/models/tax.model';

import { OrderSpec } from './models/order.model';
import {
  estimatedExecutionPrice,
  orderPreview,
  OrderPreviewContext,
  venueQuote,
} from './order-preview-logic';

// TS §7.5: branch bank F (0,25 %, min. 10 €, max. 60 €, exchange fee 3 €, whole shares) and
// neo-broker N (0,90 € flat, no exchange fee, fractional shares).
const F: DepotConditions = {
  custodyFee: { kind: 'none' },
  orderFee: { kind: 'percent', rate: 0.0025, min: 1_000, max: 6_000 },
  exchangeFee: 300,
  savingsPlanFee: { kind: 'free' },
  clearingAccountRate: 0,
  clearingAccountDebitRate: 0.1,
  venue: 'exchange',
  spreadMarkup: 0,
  fractionalShares: false,
};
const N: DepotConditions = {
  ...F,
  orderFee: { kind: 'flat', amount: 90 },
  exchangeFee: 0,
  venue: 'market-maker',
  fractionalShares: true,
};
const FREE: DepotConditions = { ...N, orderFee: { kind: 'free' } };

// Mo 01.04.2030, 10:00 (TS §7.5 „Prüfung beim Erteilen“).
const TICK = 5_389_920 + 600;

// TS §7.7, table „Verkäufe, Zinsen und Verlustvortrag“: 2031 after its first sale, net 900 €.
const YEAR_2031: TaxYear = {
  year: 2031,
  lossCarryForward: -40_000,
  income: 130_000,
  withheld: 0,
  interest: 0,
  distributions: 0,
  gains: 130_000,
  losses: 0,
  paid: 0,
  refunded: 0,
};
// TS §7.6: lots 10 for 1.013,00 € and 5 for 520,00 €.
const LOTS = [
  { buyTick: 0, quantity: 10_000_000, cost: 101_300 },
  { buyTick: 1, quantity: 5_000_000, cost: 52_000 },
];

// Geld 99,90 € / Brief 100,10 €, clearing account 2.000,00 €, reservations 500,00 €, 5 free shares.
const CONTEXT: OrderPreviewContext = {
  tick: TICK,
  conditions: F,
  quote: { bid: 99.9, ask: 100.1 },
  atPriceFloor: false,
  clearingBalance: 200_000,
  reserved: 50_000,
  freeQuantity: 5_000_000,
  lots: [],
  taxYear: YEAR_2031,
};

function buy(change: Partial<OrderSpec> = {}): OrderSpec {
  return {
    depotId: 'dep-1',
    instrumentId: 'stk-0001',
    side: 'buy',
    type: 'market',
    size: { kind: 'quantity', quantity: 10_000_000 },
    limit: null,
    stop: null,
    validity: { kind: 'day' },
    ...change,
  };
}

describe('venueQuote', () => {
  it('keeps the exchange quote without a mark-up', () => {
    expect(venueQuote({ last: 100, bid: 99.9, ask: 100.1 }, 0)).toEqual({ bid: 99.9, ask: 100.1 });
  });

  it('widens the spread by the mark-up around the last price', () => {
    // 0,20 % + 0,12 %: 100 × (1 ∓ 0,0016) on the grid.
    expect(venueQuote({ last: 100, bid: 99.9, ask: 100.1 }, 0.0012)).toEqual({
      bid: 99.84,
      ask: 100.16,
    });
  });

  it('is never narrower than the engine quote with the mark-up', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.05, max: 5_000, noNaN: true }),
        fc.double({ min: 0.0002, max: 0.05, noNaN: true }),
        fc.double({ min: 0, max: 0.002, noNaN: true }),
        (mid, spread, markup) => {
          const engine = bidAsk(mid, spread + markup);
          const estimate = venueQuote({ last: mid, ...bidAsk(mid, spread) }, markup);
          expect(estimate.ask).toBeGreaterThanOrEqual(engine.ask);
          expect(estimate.bid).toBeLessThanOrEqual(engine.bid);
        },
      ),
    );
  });
});

describe('estimatedExecutionPrice', () => {
  const quote = { bid: 99.9, ask: 100.1 };

  // TS §11.8, table „Geschätzter Ausführungskurs“
  it.each<[string, Pick<OrderSpec, 'side' | 'type' | 'limit' | 'stop'>, number]>([
    ['buy market', { side: 'buy', type: 'market', limit: null, stop: null }, 100.1],
    ['sell market', { side: 'sell', type: 'market', limit: null, stop: null }, 99.9],
    ['buy limit 100,00', { side: 'buy', type: 'limit', limit: 100, stop: null }, 100],
    ['buy limit 101,00', { side: 'buy', type: 'limit', limit: 101, stop: null }, 100.1],
    ['sell limit 100,00', { side: 'sell', type: 'limit', limit: 100, stop: null }, 100],
    ['sell limit 99,00', { side: 'sell', type: 'limit', limit: 99, stop: null }, 99.9],
    ['buy stop 105,00', { side: 'buy', type: 'stop', limit: null, stop: 105 }, 105],
    ['buy stop 95,00', { side: 'buy', type: 'stop', limit: null, stop: 95 }, 100.1],
    ['sell stop 95,00', { side: 'sell', type: 'stop', limit: null, stop: 95 }, 95],
    ['sell stop 101,00', { side: 'sell', type: 'stop', limit: null, stop: 101 }, 99.9],
    ['buy stop-limit 101 / 102', { side: 'buy', type: 'stop-limit', limit: 102, stop: 101 }, 102],
    [
      'sell stop-limit 100 / 99,5',
      { side: 'sell', type: 'stop-limit', limit: 99.5, stop: 100 },
      99.5,
    ],
  ])('estimates %s at %d €', (_label, spec, price) => {
    expect(estimatedExecutionPrice(spec, quote)).toBe(price);
  });
});

describe('orderPreview', () => {
  it('shows costs and reservation of a market purchase (TS §7.5, F)', () => {
    // Kurswert 10 × 100,10 = 1.001,00 €, Orderentgelt 10,00 € (min.), Börsenentgelt 3,00 €;
    // reservation with 5 % buffer 1.064,05 €; 1.500,00 € free.
    expect(orderPreview(buy(), CONTEXT)).toEqual({
      price: 100.1,
      fill: {
        quantity: 10_000_000,
        price: 100.1,
        marketValue: 100_100,
        orderFee: 1_000,
        exchangeFee: 300,
        total: 101_400,
      },
      reservation: 106_405,
      buffered: true,
      available: 150_000,
      shortfall: 0,
      tax: null,
      error: null,
    });
  });

  it('accepts 14 shares and shows the shortfall of 15 (TS §7.5 „Prüfung beim Erteilen“)', () => {
    const fourteen = orderPreview(
      buy({ size: { kind: 'quantity', quantity: 14_000_000 } }),
      CONTEXT,
    );
    expect([fourteen.reservation, fourteen.shortfall, fourteen.error]).toEqual([148_447, 0, null]);
    const fifteen = orderPreview(
      buy({ size: { kind: 'quantity', quantity: 15_000_000 } }),
      CONTEXT,
    );
    expect([fifteen.reservation, fifteen.shortfall, fifteen.error]).toEqual([
      158_958,
      8_958,
      'insufficient-funds',
    ]);
  });

  it('reserves a limit purchase at its limit without buffer', () => {
    const preview = orderPreview(buy({ type: 'limit', limit: 99 }), CONTEXT);
    expect([preview.price, preview.reservation, preview.buffered]).toEqual([99, 100_300, false]);
  });

  it('computes the shares of an order by amount at the ask (TS §7.5, N)', () => {
    const preview = orderPreview(buy({ size: { kind: 'amount', amount: 100_000 } }), {
      ...CONTEXT,
      conditions: N,
      quote: { bid: 33.3, ask: 33.33 },
    });
    expect(preview.fill).toMatchObject({
      quantity: 29_975_997,
      marketValue: 99_910,
      orderFee: 90,
      total: 100_000,
    });
    expect([preview.reservation, preview.buffered]).toEqual([100_000, false]);
  });

  it('blocks purchases while the clearing account is negative, the whole reservation missing', () => {
    const preview = orderPreview(buy(), { ...CONTEXT, clearingBalance: -1, reserved: 0 });
    expect([preview.error, preview.available, preview.shortfall]).toEqual([
      'clearing-account-negative',
      0,
      106_405,
    ]);
  });

  it('rejects purchases at the price floor', () => {
    expect(orderPreview(buy(), { ...CONTEXT, atPriceFloor: true }).error).toBe('price-floor');
  });

  describe('sales', () => {
    const sale = (quantity: number): OrderSpec =>
      buy({ side: 'sell', size: { kind: 'quantity', quantity } });

    it('previews gain, tax and credit within the allowance (TS §7.7)', () => {
      // 4 shares at 112,725 € with N: 450,90 € − 0,90 € = 450,00 €; 405,20 € cost, 44,80 € gain.
      const preview = orderPreview(sale(4_000_000), {
        ...CONTEXT,
        conditions: N,
        quote: { bid: 112.725, ask: 112.8 },
        lots: LOTS,
        freeQuantity: 15_000_000,
      });
      expect(preview.fill.total).toBe(45_000);
      expect(preview.tax).toEqual({ costBasis: 40_520, realizedGain: 4_480, tax: 0, net: 45_000 });
      expect([preview.reservation, preview.shortfall, preview.error]).toEqual([0, 0, null]);
    });

    it('withholds 25 % above the allowance (TS §7.7)', () => {
      // All 15 shares for 2.533,00 € without costs: 1.000,00 € gain, net 1.900 €, tax on 900 €.
      const preview = orderPreview(sale(15_000_000), {
        ...CONTEXT,
        conditions: FREE,
        quote: { bid: 168.8667, ask: 169 },
        lots: LOTS,
        freeQuantity: 15_000_000,
      });
      expect(preview.tax).toEqual({
        costBasis: 153_300,
        realizedGain: 100_000,
        tax: 22_500,
        net: 230_800,
      });
    });

    it('has no tax preview beyond the lots or without a tax year', () => {
      const context = { ...CONTEXT, lots: LOTS, freeQuantity: 15_000_000 };
      expect(orderPreview(sale(15_000_001), context).tax).toBeNull();
      expect(orderPreview(sale(15_000_001), context).error).toBe('insufficient-quantity');
      expect(orderPreview(sale(1_000_000), { ...context, taxYear: null }).tax).toBeNull();
    });
  });
});
