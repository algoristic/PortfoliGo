import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FieldTree, form } from '@angular/forms/signals';

import { transferSchema } from './transfer-schema';

import { TransferFormModel } from '../models/transfer-form.model';

const ACCOUNTS = [
  { id: 'acc-1', available: 600_000 },
  { id: 'acc-2', available: 0 },
] as const;

const VALID: TransferFormModel = {
  fromAccountId: 'acc-1',
  toAccountId: 'acc-2',
  amount: 10_000,
  purpose: 'Miete',
};

function createForm(model: Partial<TransferFormModel>): FieldTree<TransferFormModel> {
  return TestBed.runInInjectionContext(() =>
    form(signal<TransferFormModel>({ ...VALID, ...model }), transferSchema(ACCOUNTS)),
  );
}

function errorKinds(field: FieldTree<unknown>): string[] {
  return field()
    .errors()
    .map((error) => error.kind);
}

describe('transferSchema', () => {
  it('accepts a transfer up to the available amount, also without purpose', () => {
    expect(createForm({})().valid()).toBe(true);
    expect(createForm({ amount: 600_000, purpose: '' })().valid()).toBe(true);
    expect(createForm({ amount: 1 })().valid()).toBe(true);
  });

  // TS §7.4 „Überweisungen“ and the engine's codes of AP 3.3
  it.each<[string, Partial<TransferFormModel>, keyof TransferFormModel, string[]]>([
    ['no source', { fromAccountId: '' }, 'fromAccountId', ['required']],
    ['no target', { toAccountId: '' }, 'toAccountId', ['required']],
    ['the same account', { toAccountId: 'acc-1' }, 'toAccountId', ['same-account']],
    ['no amount', { amount: null }, 'amount', ['required']],
    ['0,00 €', { amount: 0 }, 'amount', ['invalid-amount']],
    ['a negative amount', { amount: -100 }, 'amount', ['invalid-amount']],
    ['0,01 € above the available amount', { amount: 600_001 }, 'amount', ['insufficient-funds']],
    [
      'any amount from an account without funds',
      { fromAccountId: 'acc-2', toAccountId: 'acc-1', amount: 1 },
      'amount',
      ['insufficient-funds'],
    ],
    ['141 characters of purpose', { purpose: 'x'.repeat(141) }, 'purpose', ['purpose-too-long']],
  ])('rejects %s', (_label, model, field, kinds) => {
    const transferForm = createForm(model);
    expect(errorKinds(transferForm[field])).toEqual(kinds);
    expect(transferForm().valid()).toBe(false);
  });

  it('counts the purpose in characters, not UTF-16 units', () => {
    // 140 emoji are 280 UTF-16 units but 140 characters, as the engine counts them.
    expect(createForm({ purpose: '💶'.repeat(140) })().valid()).toBe(true);
    expect(errorKinds(createForm({ purpose: '💶'.repeat(141) }).purpose)).toEqual([
      'purpose-too-long',
    ]);
  });

  it('names the available amount when the amount exceeds it', () => {
    const [error] = createForm({ amount: 600_001 }).amount().errors();
    expect(error.message?.replace(/\s/g, ' ')).toBe('Du kannst höchstens 6.000,00 € überweisen.');
  });
});
