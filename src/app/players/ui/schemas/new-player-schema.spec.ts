import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FieldTree, form } from '@angular/forms/signals';

import { newPlayerSchema } from './new-player-schema';

import { NewPlayerFormModel } from '../models/new-player-form.model';

const VALID: NewPlayerFormModel = {
  name: 'Anna',
  seed: 'kupfer-falke-731',
  startCapital: 1_000_000,
  netIncome: 250_000,
  livingCosts: 180_000,
};

function createForm(model: Partial<NewPlayerFormModel>): FieldTree<NewPlayerFormModel> {
  return TestBed.runInInjectionContext(() =>
    form(signal<NewPlayerFormModel>({ ...VALID, ...model }), newPlayerSchema),
  );
}

describe('newPlayerSchema', () => {
  it('accepts the defaults of the product specification', () => {
    expect(createForm({})().valid()).toBe(true);
  });

  // PS US-SP-01: name 1–40 characters, required
  it.each<[string, Partial<NewPlayerFormModel>, keyof NewPlayerFormModel, string[]]>([
    ['an empty name', { name: '' }, 'name', ['required']],
    ['a name of blanks', { name: '   ' }, 'name', ['required']],
    ['a name of 41 characters', { name: 'x'.repeat(41) }, 'name', ['too-long']],
    ['an empty seed', { seed: '' }, 'seed', ['required']],
    ['a seed of blanks', { seed: ' \t' }, 'seed', ['required']],
    ['a seed with a dot', { seed: 'seed.1' }, 'seed', ['invalid-characters']],
    ['an empty start capital', { startCapital: null }, 'startCapital', ['required']],
    ['a negative start capital', { startCapital: -1 }, 'startCapital', ['too-small']],
    ['1.000.000,01 € start capital', { startCapital: 100_000_001 }, 'startCapital', ['too-large']],
    ['an empty net income', { netIncome: null }, 'netIncome', ['required']],
    ['50.000,01 € net income', { netIncome: 5_000_001 }, 'netIncome', ['too-large']],
    ['negative living costs', { livingCosts: -100 }, 'livingCosts', ['too-small']],
    ['50.000,01 € living costs', { livingCosts: 5_000_001 }, 'livingCosts', ['too-large']],
  ])('rejects %s', (_label, model, field, kinds) => {
    const playerForm = createForm(model);
    expect(
      playerForm[field]()
        .errors()
        .map((error) => error.kind),
    ).toEqual(kinds);
    expect(
      playerForm[field]()
        .errors()
        .every((error) => error.message),
    ).toBe(true);
    expect(playerForm().valid()).toBe(false);
  });

  it('names the limit in the message', () => {
    const playerForm = createForm({ netIncome: 5_000_001, name: 'x'.repeat(41) });
    expect(playerForm.netIncome().errors()[0].message).toContain('50.000');
    expect(playerForm.name().errors()[0].message).toContain('40');
  });

  // PS US-SP-01: limits are inclusive; living costs above the income are allowed
  it.each<[string, Partial<NewPlayerFormModel>]>([
    ['a name of 40 characters', { name: 'x'.repeat(40) }],
    ['zero amounts', { startCapital: 0, netIncome: 0, livingCosts: 0 }],
    [
      'the upper limits',
      { startCapital: 100_000_000, netIncome: 5_000_000, livingCosts: 5_000_000 },
    ],
    ['living costs above the income', { netIncome: 100_000, livingCosts: 300_000 }],
  ])('accepts %s', (_label, model) => {
    expect(createForm(model)().valid()).toBe(true);
  });

  it('marks name, seed and amounts as required', () => {
    const playerForm = createForm({});
    const fields = ['name', 'seed', 'startCapital', 'netIncome', 'livingCosts'] as const;
    expect(fields.map((field) => playerForm[field]().required())).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
  });
});
