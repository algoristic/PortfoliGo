import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FieldTree, form } from '@angular/forms/signals';

import { FeeModel } from '@app/banking/domain/models/bank-conditions.model';

import { savingsPlanSchema, savingsPlanSpecOf } from './savings-plan-schema';

import { SavingsPlanFormModel } from '../models/savings-plan.model';

const VALID: SavingsPlanFormModel = {
  depotId: 'dep-2',
  instrumentId: 'etf-0001',
  amount: 5_000,
  day: '15',
};

/** `dep-2` charges 1,50 € per execution, `dep-4` 1,5 %, other depots are unknown. */
const FEES: Readonly<Record<string, FeeModel>> = {
  'dep-2': { kind: 'flat', amount: 150 },
  'dep-4': { kind: 'percent', rate: 0.015 },
};

function createForm(
  model: Partial<SavingsPlanFormModel>,
  fixedTarget = false,
): FieldTree<SavingsPlanFormModel> {
  return TestBed.runInInjectionContext(() =>
    form(
      signal<SavingsPlanFormModel>({ ...VALID, ...model }),
      savingsPlanSchema({ feeOf: (id) => FEES[id] ?? null, fixedTarget }),
    ),
  );
}

function errorKinds(field: FieldTree<unknown>): string[] {
  return field()
    .errors()
    .map((error) => error.kind);
}

describe('savingsPlanSchema', () => {
  // TS §7.8 „Prüfung“ and the engine's codes of AP 5.6b
  it.each<[string, Partial<SavingsPlanFormModel>, keyof SavingsPlanFormModel | null, string[]]>([
    ['a valid plan', {}, null, []],
    ['day 1 and day 28', { day: '28' }, null, []],
    ['an amount above any balance', { amount: 100_000_000 }, null, []],
    ['1,00 € with percent costs', { depotId: 'dep-4', amount: 100 }, null, []],
    ['1,51 € with 1,50 € costs', { amount: 151 }, null, []],
    ['no depot', { depotId: '' }, 'depotId', ['required']],
    ['no instrument', { instrumentId: '' }, 'instrumentId', ['required']],
    ['no amount', { amount: null }, 'amount', ['required']],
    ['0,99 €', { depotId: 'dep-4', amount: 99 }, 'amount', ['amount-too-small']],
    ['1,50 € with 1,50 € costs', { amount: 150 }, 'amount', ['amount-below-costs']],
    ['an unknown depot', { depotId: 'dep-9', amount: 100 }, 'amount', []],
    ['no day', { day: '' }, 'day', ['required']],
    ['day 29', { day: '29' }, 'day', ['invalid-day']],
    ['day 0', { day: '0' }, 'day', ['invalid-day']],
  ])('checks %s', (_case, model, field, expected) => {
    const savingsPlanForm = createForm(model);
    if (field !== null) {
      expect(errorKinds(savingsPlanForm[field])).toEqual(expected);
    } else {
      expect(savingsPlanForm().valid()).toBe(true);
    }
  });

  it('keeps depot and instrument when changing a plan', () => {
    const savingsPlanForm = createForm({}, true);
    expect(savingsPlanForm.depotId().disabled()).toBe(true);
    expect(savingsPlanForm.instrumentId().disabled()).toBe(true);
    expect(savingsPlanForm.amount().disabled()).toBe(false);
    expect(createForm({}).depotId().disabled()).toBe(false);
  });

  it('turns a complete form into the command values', () => {
    expect(savingsPlanSpecOf(VALID)).toEqual({
      depotId: 'dep-2',
      instrumentId: 'etf-0001',
      amount: 5_000,
      day: 15,
    });
    expect(savingsPlanSpecOf({ ...VALID, amount: null })).toBeNull();
    expect(savingsPlanSpecOf({ ...VALID, day: '' })).toBeNull();
  });
});
