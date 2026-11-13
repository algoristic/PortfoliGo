import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FieldTree, form } from '@angular/forms/signals';

import { DepotConditions } from '@app/banking/domain/models/bank-conditions.model';
import { OrderView } from '@app/engine/domain/models/trading-view.model';

import {
  changedOrderReservation,
  changeOrderModel,
  changeOrderSchema,
  orderChangeOf,
} from './change-order-schema';

import { ChangeOrderContext, ChangeOrderModel } from '../models/change-order.model';

// TS §7.5 „Ändern einer Kauforder“: Mo 01.04.2030, 10:00; bank F; buy limit 99,00, 10 shares,
// reservation 1.003,00 €; clearing account 2.000,00 €, all reservations 1.503,00 €, so 497,00 € free.
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
const TICK = 5_390_520;

const LIMIT_BUY: OrderView = {
  id: 'ord-1',
  depotId: 'dep-2',
  instrumentId: 'stk-1',
  side: 'buy',
  type: 'limit',
  size: { kind: 'quantity', quantity: 10_000_000 },
  limit: 99,
  stop: null,
  validity: { kind: 'gtc' },
  status: 'open',
  placedAt: TICK - 60,
  expiresAt: TICK + 525_600,
  reserved: 100_300,
  triggeredAt: null,
  execution: null,
  closedAt: null,
  rejection: null,
};
const STOP_LIMIT_BUY: OrderView = {
  ...LIMIT_BUY,
  id: 'ord-2',
  type: 'stop-limit',
  stop: 101,
  limit: 102,
  validity: { kind: 'date', date: { year: 2030, month: 4, day: 30 } },
};

const CONTEXT: ChangeOrderContext = {
  order: LIMIT_BUY,
  instrumentName: 'Astix',
  tick: TICK,
  conditions: F,
  clearingBalance: 200_000,
  reserved: 150_300,
  ask: 100.1,
};

function createForm(
  model: Partial<ChangeOrderModel>,
  context: Partial<ChangeOrderContext> = {},
): FieldTree<ChangeOrderModel> {
  const order = context.order ?? CONTEXT.order;
  return TestBed.runInInjectionContext(() =>
    form(
      signal<ChangeOrderModel>({ ...changeOrderModel(order, TICK), ...model }),
      changeOrderSchema(() => ({ ...CONTEXT, ...context })),
    ),
  );
}

function errorKinds(field: FieldTree<unknown>): string[] {
  return field()
    .errors()
    .map((error) => error.kind);
}

describe('changeOrderModel', () => {
  it('starts with the prices and the validity of the order', () => {
    expect(changeOrderModel(LIMIT_BUY, TICK)).toEqual({
      limit: '99,00',
      stop: '',
      validity: 'gtc',
      validityDate: '2030-04-01',
    });
    expect(changeOrderModel(STOP_LIMIT_BUY, TICK)).toEqual({
      limit: '102,00',
      stop: '101,00',
      validity: 'date',
      validityDate: '2030-04-30',
    });
  });
});

describe('orderChangeOf', () => {
  it.each<[string, OrderView, Partial<ChangeOrderModel>, object | null]>([
    ['nothing changed', LIMIT_BUY, {}, {}],
    ['the same limit typed differently', LIMIT_BUY, { limit: '99' }, {}],
    ['a new limit', LIMIT_BUY, { limit: '100' }, { limit: 100 }],
    ['a new validity kind', LIMIT_BUY, { validity: 'day' }, { validity: { kind: 'day' } }],
    [
      'a date',
      LIMIT_BUY,
      { validity: 'date', validityDate: '2030-05-15' },
      { validity: { kind: 'date', date: { year: 2030, month: 5, day: 15 } } },
    ],
    ['the same date', STOP_LIMIT_BUY, { validityDate: '2030-04-30' }, {}],
    ['a new stop', STOP_LIMIT_BUY, { stop: '100,5' }, { stop: 100.5 }],
    ['an unreadable limit', LIMIT_BUY, { limit: 'abc' }, null],
    ['an empty stop', STOP_LIMIT_BUY, { stop: '' }, null],
    ['a missing date', LIMIT_BUY, { validity: 'date', validityDate: '' }, null],
  ])('sends only the changed fields for %s', (_label, order, model, change) => {
    expect(orderChangeOf({ ...changeOrderModel(order, TICK), ...model }, order)).toEqual(change);
  });

  it('ignores a stop typed into a limit order', () => {
    expect(orderChangeOf({ ...changeOrderModel(LIMIT_BUY, TICK), stop: '5' }, LIMIT_BUY)).toEqual(
      {},
    );
  });
});

describe('changeOrderSchema', () => {
  it.each<[string, Partial<ChangeOrderModel>]>([
    ['limit 100,00 (+10,00 €)', { limit: '100' }],
    ['limit 148,00 (+490,00 €)', { limit: '148' }],
    ['until 01.04.2031', { validity: 'date', validityDate: '2031-04-01' }],
    ['no change', {}],
  ])('accepts %s', (_label, model) => {
    expect(createForm(model)().valid()).toBe(true);
  });

  it.each<[string, Partial<ChangeOrderModel>, keyof ChangeOrderModel, string[]]>([
    ['limit 149,00 (+500,00 €)', { limit: '149' }, 'limit', ['insufficient-funds']],
    ['limit 0', { limit: '0' }, 'limit', ['invalid-limit']],
    ['no limit', { limit: '' }, 'limit', ['required']],
    ['an unreadable limit', { limit: '9,9,9' }, 'limit', ['price']],
    [
      'until 31.03.2030',
      { validity: 'date', validityDate: '2030-03-31' },
      'validityDate',
      ['invalid-validity'],
    ],
    [
      'until 02.04.2031',
      { validity: 'date', validityDate: '2031-04-02' },
      'validityDate',
      ['validity-too-long'],
    ],
    ['no date', { validity: 'date', validityDate: '' }, 'validityDate', ['required']],
  ])('rejects %s', (_label, model, field, kinds) => {
    const change = createForm(model);
    expect(errorKinds(change[field])).toEqual(kinds);
    expect(change().valid()).toBe(false);
  });

  // No money free: the reservations take the whole balance.
  it('accepts a higher limit of a sale without free money', () => {
    const sale: OrderView = { ...LIMIT_BUY, side: 'sell', reserved: 0 };
    expect(createForm({ limit: '500' }, { order: sale, clearingBalance: 150_300 })().valid()).toBe(
      true,
    );
  });

  it('accepts a new stop while the stop-limit order is open', () => {
    expect(createForm({ stop: '100' }, { order: STOP_LIMIT_BUY })().valid()).toBe(true);
  });

  it('locks the stop of a triggered stop-limit order but changes its limit', () => {
    const triggered: OrderView = { ...STOP_LIMIT_BUY, status: 'triggered', triggeredAt: TICK };
    const change = createForm({ limit: '101,5' }, { order: triggered });
    expect(change.stop().disabled()).toBe(true);
    expect(change().valid()).toBe(true);
  });

  it.each(['executed', 'cancelled'] as const)('refuses to change an order that is %s', (status) => {
    const change = createForm({ limit: '100' }, { order: { ...LIMIT_BUY, status } });
    expect(errorKinds(change)).toEqual(['order-not-active']);
    expect(change().valid()).toBe(false);
  });
});

describe('changedOrderReservation', () => {
  it.each([
    ['99', 100_300],
    ['100', 101_300],
    ['148', 149_300],
  ])('reserves for limit %s € what the table says', (limit, reserved) => {
    expect(changedOrderReservation({ ...changeOrderModel(LIMIT_BUY, TICK), limit }, CONTEXT)).toBe(
      reserved,
    );
  });

  it('reserves nothing for a sale', () => {
    const sale: OrderView = { ...LIMIT_BUY, side: 'sell', reserved: 0 };
    expect(
      changedOrderReservation(changeOrderModel(sale, TICK), { ...CONTEXT, order: sale }),
    ).toBeNull();
  });
});
