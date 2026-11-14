import fc from 'fast-check';

import { DepotId } from '@app/banking/domain/models/account.model';
import { Order, OrderExecution } from '@app/trading/domain/models/order.model';

import { DepotPosition } from './models/position-detail.model';
import { positionDetail, positionTrades } from './position-detail-logic';

const DEPOT_A = 'dep-1' as DepotId;
const DEPOT_B = 'dep-2' as DepotId;
const SHARE = 1_000_000;

// TS §7.6/§7.9 (AP 5.5): depot A holds the lots of the partial sale table after the sale of 4
// shares (6 for 607,80 €, 5 for 520,00 €, realized +44,80 €), depot B 2 shares bought in between
// for 210,00 € with a distribution of 3,00 €.
const POSITION_A: DepotPosition = {
  depotId: DEPOT_A,
  instrumentId: 'stk-0001',
  quantity: 11 * SHARE,
  cost: 112_780,
  lots: [
    { buyTick: 100, quantity: 6 * SHARE, cost: 60_780 },
    { buyTick: 300, quantity: 5 * SHARE, cost: 52_000 },
  ],
  realizedGain: 4_480,
  distributions: 0,
};
const POSITION_B: DepotPosition = {
  depotId: DEPOT_B,
  instrumentId: 'stk-0001',
  quantity: 2 * SHARE,
  cost: 21_000,
  lots: [{ buyTick: 200, quantity: 2 * SHARE, cost: 21_000 }],
  realizedGain: 0,
  distributions: 300,
};

describe('positionDetail', () => {
  it('shows one depot with its lots, realized gain and distributions', () => {
    const detail = positionDetail([POSITION_A], 'Aktie A', 110);
    expect(detail).toMatchObject({
      instrumentId: 'stk-0001',
      quantity: 11 * SHARE,
      cost: 112_780,
      price: 110,
      value: 121_000,
      gain: 8_220,
      realizedGain: 4_480,
      distributions: 0,
    });
    expect(detail?.averageCost).toBeCloseTo(1_127.8 / 11, 10);
    expect(detail?.gainRatio).toBeCloseTo(8_220 / 112_780, 12);
    expect(detail?.lots).toEqual([
      { buyTick: 100, quantity: 6 * SHARE, cost: 60_780, depotId: DEPOT_A, costPerShare: 101.3 },
      { buyTick: 300, quantity: 5 * SHARE, cost: 52_000, depotId: DEPOT_A, costPerShare: 104 },
    ]);
  });

  it('combines the depots and orders the lots by purchase time', () => {
    const detail = positionDetail([POSITION_A, POSITION_B], 'Aktie A', 110);
    expect(detail).toMatchObject({
      quantity: 13 * SHARE,
      cost: 133_780,
      value: 143_000,
      gain: 9_220,
      realizedGain: 4_480,
      distributions: 300,
    });
    expect(detail?.lots.map(({ depotId, buyTick }) => [depotId, buyTick])).toEqual([
      [DEPOT_A, 100],
      [DEPOT_B, 200],
      [DEPOT_A, 300],
    ]);
    expect(detail?.lots[1].costPerShare).toBe(105);
  });

  it('keeps the purchase order of lots with the same tick in depot order', () => {
    const same = { ...POSITION_B, lots: [{ buyTick: 100, quantity: 2 * SHARE, cost: 21_000 }] };
    const detail = positionDetail([POSITION_A, same], 'Aktie A', 110);
    expect(detail?.lots.map(({ depotId }) => depotId)).toEqual([DEPOT_A, DEPOT_B, DEPOT_A]);
  });

  it('leaves value and gain open without a quote', () => {
    const detail = positionDetail([POSITION_A], 'Aktie A', null);
    expect(detail).toMatchObject({ price: null, value: null, gain: null, gainRatio: null });
    expect(detail?.cost).toBe(112_780);
  });

  it('gives no detail without shares', () => {
    expect(positionDetail([], 'Aktie A', 110)).toBeNull();
    expect(positionDetail([{ ...POSITION_A, quantity: 0, lots: [] }], 'Aktie A', 110)).toBeNull();
  });

  it('ignores depots without shares in the sums', () => {
    const empty: DepotPosition = { ...POSITION_B, quantity: 0, lots: [], distributions: 500 };
    expect(positionDetail([POSITION_A, empty], 'Aktie A', 110)?.distributions).toBe(0);
  });

  it('keeps the shares and the costs of the depots in the lots', () => {
    const lot = fc.record({
      buyTick: fc.integer({ min: 0, max: 1_000_000 }),
      quantity: fc.integer({ min: 1, max: 1_000 * SHARE }),
      cost: fc.integer({ min: 0, max: 10_000_000 }),
    });
    const part = fc.record({
      depotId: fc.constantFrom(DEPOT_A, DEPOT_B),
      lots: fc.array(lot, { minLength: 1, maxLength: 5 }),
    });
    fc.assert(
      fc.property(fc.array(part, { minLength: 1, maxLength: 3 }), (parts) => {
        const positions = parts.map(({ depotId, lots }): DepotPosition => ({
          depotId,
          instrumentId: 'stk-0001',
          quantity: lots.reduce((sum, { quantity }) => sum + quantity, 0),
          cost: lots.reduce((sum, { cost }) => sum + cost, 0),
          lots,
          realizedGain: 0,
          distributions: 0,
        }));
        const detail = positionDetail(positions, 'Aktie A', null);
        const lots = detail?.lots ?? [];
        expect(lots.reduce((sum, { quantity }) => sum + quantity, 0)).toBe(detail?.quantity);
        expect(lots.reduce((sum, { cost }) => sum + cost, 0)).toBe(detail?.cost);
        lots.slice(1).forEach((current, index) => {
          expect(current.buyTick).toBeGreaterThanOrEqual(lots[index].buyTick);
        });
      }),
    );
  });
});

function order(
  id: string,
  overrides: Partial<Order>,
  execution: Partial<OrderExecution> | null = {},
): Order {
  return {
    id,
    depotId: DEPOT_A,
    instrumentId: 'stk-0001',
    side: 'buy',
    type: 'market',
    size: { kind: 'quantity', quantity: 10 * SHARE },
    limit: null,
    stop: null,
    validity: { kind: 'gtc' },
    status: 'executed',
    placedAt: 0,
    expiresAt: 100_000,
    reserved: 0,
    triggeredAt: null,
    execution:
      execution === null
        ? null
        : {
            tick: 600,
            quantity: 10 * SHARE,
            price: 100,
            marketValue: 100_000,
            orderFee: 990,
            exchangeFee: 310,
            total: 101_300,
            ...execution,
          },
    closedAt: 600,
    rejection: null,
    ...overrides,
  };
}

describe('positionTrades', () => {
  // TS §7.5: the purchase of 10 shares at 100,00 € with 9,90 € order and 3,10 € exchange fee.
  const orders: Order[] = [
    order('ord-1', {}),
    order('ord-2', { side: 'sell' }, { tick: 900, total: 44_000, orderFee: 500, exchangeFee: 0 }),
    order('ord-3', { depotId: DEPOT_B }, { tick: 700 }),
    order('ord-4', { instrumentId: 'stk-0002' }),
    order('ord-5', { status: 'cancelled', closedAt: 650 }, null),
    order('ord-6', { status: 'open', closedAt: null }, null),
    order('ord-10', {}, { tick: 900 }),
  ];

  it('lists the executions of the instrument in all depots newest first', () => {
    const trades = positionTrades(orders, 'stk-0001', null);
    expect(trades.map(({ orderId }) => orderId)).toEqual(['ord-10', 'ord-2', 'ord-3', 'ord-1']);
    expect(trades[3]).toEqual({
      orderId: 'ord-1',
      depotId: DEPOT_A,
      side: 'buy',
      tick: 600,
      quantity: 10 * SHARE,
      price: 100,
      costs: 1_300,
      total: 101_300,
    });
    expect(trades[1]).toMatchObject({ side: 'sell', costs: 500, total: 44_000 });
  });

  it('keeps only the shown depots', () => {
    expect(positionTrades(orders, 'stk-0001', [DEPOT_B]).map(({ orderId }) => orderId)).toEqual([
      'ord-3',
    ]);
    expect(positionTrades(orders, 'stk-0001', [])).toEqual([]);
  });

  it('skips executed orders without an execution', () => {
    expect(positionTrades([order('ord-1', {}, null)], 'stk-0001', null)).toEqual([]);
  });
});
