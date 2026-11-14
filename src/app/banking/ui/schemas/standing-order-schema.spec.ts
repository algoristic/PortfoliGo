import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FieldTree, form } from '@angular/forms/signals';

import { standingOrderSchema } from './standing-order-schema';

import { StandingOrderFormModel } from '../models/standing-order-form.model';

const VALID: StandingOrderFormModel = {
  fromAccountId: 'acc-1',
  toAccountId: 'acc-2',
  amount: 50_000,
  day: '15',
  purpose: 'Sparplan',
};

function createForm(model: Partial<StandingOrderFormModel>): FieldTree<StandingOrderFormModel> {
  return TestBed.runInInjectionContext(() =>
    form(signal<StandingOrderFormModel>({ ...VALID, ...model }), standingOrderSchema),
  );
}

function errorKinds(field: FieldTree<unknown>): string[] {
  return field()
    .errors()
    .map((error) => error.kind);
}

describe('standingOrderSchema', () => {
  // TS §7.4 „Daueraufträge“ and the engine's codes of AP 5.6a
  it.each<[string, Partial<StandingOrderFormModel>, keyof StandingOrderFormModel | null, string[]]>(
    [
      ['a valid order', {}, null, []],
      ['day 1 without purpose', { day: '1', purpose: '' }, null, []],
      ['day 28', { day: '28' }, null, []],
      ['an amount above any balance', { amount: 100_000_000 }, null, []],
      ['a purpose of 140 characters', { purpose: 'x'.repeat(140) }, null, []],
      ['no source', { fromAccountId: '' }, 'fromAccountId', ['required']],
      ['no target', { toAccountId: '' }, 'toAccountId', ['required']],
      ['the same account', { toAccountId: 'acc-1' }, 'toAccountId', ['same-account']],
      ['no amount', { amount: null }, 'amount', ['required']],
      ['0 cents', { amount: 0 }, 'amount', ['invalid-amount']],
      ['no day', { day: '' }, 'day', ['required']],
      ['day 29', { day: '29' }, 'day', ['invalid-day']],
      ['day 0', { day: '0' }, 'day', ['invalid-day']],
      [
        'a purpose of 141 characters',
        { purpose: 'x'.repeat(141) },
        'purpose',
        ['purpose-too-long'],
      ],
    ],
  )('checks %s', (_case, model, field, expected) => {
    const standingOrderForm = createForm(model);
    expect(standingOrderForm().valid()).toBe(expected.length === 0);
    if (field !== null) {
      expect(errorKinds(standingOrderForm[field])).toEqual(expected);
    }
  });
});
