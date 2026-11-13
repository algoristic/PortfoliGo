import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FieldTree, form } from '@angular/forms/signals';

import { DepotConditions } from '@app/banking/domain/models/bank-conditions.model';
import { Instrument } from '@app/market/domain/models/instrument.model';

import { orderTicketSchema, orderTicketSpec } from './order-ticket-schema';

import { OrderTicketContext, OrderTicketModel } from '../models/order-ticket.model';

// TS §7.5 „Prüfung beim Erteilen“: Mo 01.04.2030, 10:00; F; Geld 99,90 € / Brief 100,10 €;
// clearing account 2.000,00 €, reservations 500,00 €, so 1.500,00 € free; 5 free shares.
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

const CONTEXT: OrderTicketContext = {
  instrument: { id: 'stk-1', kind: 'stock', name: 'Astix', series: 0 } as Instrument,
  quote: { last: 100, bid: 99.9, ask: 100.1 },
  atPriceFloor: false,
  marketOpen: true,
  tick: 5_390_520,
  depots: [
    {
      depotId: 'dep-2',
      number: '0000000002',
      bankName: 'F',
      conditions: F,
      clearingBalance: 200_000,
      reserved: 50_000,
      position: {
        instrumentId: 'stk-1',
        quantity: 5_000_000,
        free: 5_000_000,
        cost: 50_000,
        lots: [{ buyTick: 0, quantity: 5_000_000, cost: 50_000 }],
        realizedGain: 0,
        distributions: 0,
      },
    },
  ],
  taxYear: null,
};

// The starting order of the table: buy market 10 shares, until the end of the day.
const VALID: OrderTicketModel = {
  depotId: 'dep-2',
  side: 'buy',
  sizeKind: 'quantity',
  quantity: '10',
  amount: null,
  type: 'market',
  limit: '',
  stop: '',
  validity: 'day',
  validityDate: '',
};

function createForm(
  model: Partial<OrderTicketModel>,
  context: Partial<OrderTicketContext> = {},
): FieldTree<OrderTicketModel> {
  return TestBed.runInInjectionContext(() =>
    form(
      signal<OrderTicketModel>({ ...VALID, ...model }),
      orderTicketSchema(() => ({ ...CONTEXT, ...context })),
    ),
  );
}

function errorKinds(field: FieldTree<unknown>): string[] {
  return field()
    .errors()
    .map((error) => error.kind);
}

describe('orderTicketSchema', () => {
  it.each<[string, Partial<OrderTicketModel>]>([
    ['the starting order', {}],
    ['market 14 shares', { quantity: '14' }],
    ['an amount of 1.500,00 €', { sizeKind: 'amount', amount: 150_000, quantity: 'x' }],
    ['a sale of 1,5 shares', { side: 'sell', quantity: '1,5' }],
    ['a sale of all 5 shares', { side: 'sell', quantity: '5', sizeKind: 'amount' }],
    ['stop-limit 101,00 / 102,00', { type: 'stop-limit', stop: '101', limit: '102' }],
    ['until 01.04.2031', { validity: 'date', validityDate: '2031-04-01' }],
  ])('accepts %s', (_label, model) => {
    expect(createForm(model)().valid()).toBe(true);
  });

  it.each<[string, Partial<OrderTicketModel>, keyof OrderTicketModel, string[]]>([
    ['no depot', { depotId: '' }, 'depotId', ['required']],
    ['no quantity', { quantity: '' }, 'quantity', ['required']],
    ['unreadable shares', { quantity: '1,2,3' }, 'quantity', ['quantity']],
    ['0 shares', { quantity: '0' }, 'quantity', ['invalid-quantity']],
    ['a purchase of 1,5 shares', { quantity: '1,5' }, 'quantity', ['fractional-not-allowed']],
    [
      'a sale of 5,000001 shares',
      { side: 'sell', quantity: '5,000001' },
      'quantity',
      ['insufficient-quantity'],
    ],
    ['market 15 shares', { quantity: '15' }, 'quantity', ['insufficient-funds']],
    ['no amount', { sizeKind: 'amount' }, 'amount', ['required']],
    ['1.500,01 €', { sizeKind: 'amount', amount: 150_001 }, 'amount', ['insufficient-funds']],
    ['a limit order without limit', { type: 'limit' }, 'limit', ['required']],
    ['an unreadable limit', { type: 'limit', limit: 'abc' }, 'limit', ['price']],
    ['a limit of 0', { type: 'limit', limit: '0' }, 'limit', ['invalid-limit']],
    ['a stop of 0', { type: 'stop', stop: '0' }, 'stop', ['invalid-stop']],
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
    const ticket = createForm(model);
    expect(errorKinds(ticket[field])).toEqual(kinds);
    expect(ticket().valid()).toBe(false);
  });

  it('names the shortfall at the size (US-HD-01)', () => {
    const ticket = createForm({ quantity: '15' });
    expect(ticket.quantity().errors()[0]?.message).toBe(
      'Das Guthaben auf dem Verrechnungskonto reicht nicht, es fehlen 89,58 €.',
    );
  });

  it.each<[string, Partial<OrderTicketContext>, string]>([
    ['at the price floor', { atPriceFloor: true }, 'price-floor'],
    [
      'with a negative clearing account',
      {
        depots: [{ ...CONTEXT.depots[0], clearingBalance: -1 }],
      },
      'clearing-account-negative',
    ],
  ])('blocks purchases %s at the side', (_label, context, kind) => {
    const ticket = createForm({}, context);
    expect(errorKinds(ticket.side)).toEqual([kind]);
    // Sales stay possible (TS §7.5).
    expect(createForm({ side: 'sell', quantity: '1' }, context)().valid()).toBe(true);
  });
});

describe('orderTicketSpec', () => {
  it('builds the order of the ticket', () => {
    expect(
      orderTicketSpec(
        {
          ...VALID,
          type: 'stop-limit',
          stop: '101',
          limit: '102,5',
          validity: 'date',
          validityDate: '2030-05-15',
        },
        CONTEXT,
      ),
    ).toEqual({
      depotId: 'dep-2',
      instrumentId: 'stk-1',
      side: 'buy',
      type: 'stop-limit',
      size: { kind: 'quantity', quantity: 10_000_000 },
      limit: 102.5,
      stop: 101,
      validity: { kind: 'date', date: { year: 2030, month: 5, day: 15 } },
    });
  });

  it('sells by quantity even when the amount was chosen and ignores prices of other types', () => {
    expect(
      orderTicketSpec(
        { ...VALID, side: 'sell', sizeKind: 'amount', amount: 500, limit: '9', stop: '8' },
        CONTEXT,
      ),
    ).toMatchObject({ size: { kind: 'quantity', quantity: 10_000_000 }, limit: null, stop: null });
  });

  it('is null while a needed field is missing', () => {
    expect(orderTicketSpec({ ...VALID, quantity: '' }, CONTEXT)).toBeNull();
    expect(orderTicketSpec({ ...VALID, depotId: 'dep-9' }, CONTEXT)).toBeNull();
    expect(orderTicketSpec({ ...VALID, type: 'limit' }, CONTEXT)).toBeNull();
  });
});
