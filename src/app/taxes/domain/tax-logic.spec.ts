import fc from 'fast-check';

import { TaxYear } from './models/tax.model';
import {
  assessTaxableIncome,
  closeTaxYear,
  netTaxableIncome,
  openTaxYear,
  taxDue,
  taxTransactionType,
} from './tax-logic';

/** Runs events through the year; `'year-end'` closes it. Returns each delta. */
function run(
  state: TaxYear,
  events: (number | 'year-end')[],
): { state: TaxYear; deltas: number[] } {
  const deltas: number[] = [];
  for (const event of events) {
    if (event === 'year-end') {
      state = closeTaxYear(state);
      continue;
    }
    const assessment = assessTaxableIncome(state, event);
    state = assessment.state;
    deltas.push(assessment.delta);
  }
  return { state, deltas };
}

describe('tax-logic', () => {
  describe('taxDue', () => {
    // TS §7.7: 25 % above the saver's allowance of 1,000 €, rounded half away from zero
    it.each([
      [-300_000, 0],
      [0, 0],
      [100_000, 0],
      [100_001, 0],
      [100_002, 1],
      [120_000, 5_000],
      [121_699, 5_425],
    ])('taxes a result of %d cents with %d cents', (net, due) => {
      expect(taxDue(net)).toBe(due);
    });
  });

  describe('assessTaxableIncome', () => {
    // TS §7.7: example 2030
    it('withholds and refunds along the example year', () => {
      const { state, deltas } = run(openTaxYear(2030), [40_000, 50_000, 30_000, 1_699, -100_000]);
      expect(deltas).toEqual([0, 0, 5_000, 425, -5_425]);
      expect(state).toEqual({ year: 2030, lossCarryForward: 0, income: 21_699, withheld: 0 });
      expect(closeTaxYear(state)).toEqual({
        year: 2031,
        lossCarryForward: 0,
        income: 0,
        withheld: 0,
      });
    });

    // TS §7.7: loss carry-forward over the year end
    it('carries a loss into the next year', () => {
      const { state, deltas } = run(openTaxYear(2030), [
        -300_000,
        50_000,
        'year-end',
        300_000,
        100_000,
      ]);
      expect(deltas).toEqual([0, 0, 0, 12_500]);
      expect(state).toEqual({
        year: 2031,
        lossCarryForward: -250_000,
        income: 400_000,
        withheld: 12_500,
      });
      expect(closeTaxYear(state).lossCarryForward).toBe(0);
    });

    it('lets the allowance lapse at the year end', () => {
      const { deltas } = run(openTaxYear(2030), [60_000, 'year-end', 60_000]);
      expect(deltas).toEqual([0, 0]);
      const second = run(openTaxYear(2030), [60_000, 'year-end', 120_000]);
      expect(second.deltas).toEqual([0, 5_000]);
    });

    it('sums the deltas of a year to the tax on the yearly result', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1e8, max: 0 }),
          fc.array(fc.integer({ min: -1e7, max: 1e7 }), { maxLength: 30 }),
          (carryForward, amounts) => {
            const start = openTaxYear(2030, carryForward);
            const { state, deltas } = run(start, amounts);
            const total = amounts.reduce((sum, amount) => sum + amount, 0);
            expect(deltas.reduce((sum, delta) => sum + delta, 0)).toBe(
              taxDue(carryForward + total),
            );
            expect(state.withheld).toBe(taxDue(netTaxableIncome(state)));
          },
        ),
      );
    });

    it('withholds at most the income of the event and refunds at most its loss', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1e8, max: 0 }),
          fc.array(fc.integer({ min: -1e7, max: 1e7 }), { maxLength: 10 }),
          fc.integer({ min: -1e7, max: 1e7 }),
          (carryForward, before, amount) => {
            const { state } = run(openTaxYear(2030, carryForward), before);
            const { delta } = assessTaxableIncome(state, amount);
            if (amount >= 0) {
              expect(delta).toBeGreaterThanOrEqual(0);
              expect(delta).toBeLessThanOrEqual(amount);
            } else {
              expect(delta).toBeLessThanOrEqual(0);
              expect(delta).toBeGreaterThanOrEqual(amount);
            }
          },
        ),
      );
    });

    it('rejects amounts that are not whole cents', () => {
      expect(() => assessTaxableIncome(openTaxYear(2030), 0.5)).toThrow(/whole cents: 0.5/);
    });

    it('leaves its input unchanged', () => {
      const state = openTaxYear(2030);
      assessTaxableIncome(state, 200_000);
      expect(state).toEqual(openTaxYear(2030));
    });
  });

  describe('closeTaxYear', () => {
    it.each([
      [0, 150_000, 0],
      [0, -1, -1],
      [-250_000, 100_000, -150_000],
      [-250_000, 300_000, 0],
    ])('carries %d + %d cents forward as %d', (carryForward, income, next) => {
      const { state } = run(openTaxYear(2030, carryForward), [income]);
      expect(closeTaxYear(state)).toEqual({
        year: 2031,
        lossCarryForward: next,
        income: 0,
        withheld: 0,
      });
    });
  });

  describe('openTaxYear', () => {
    it.each([1, 0.5])('rejects the loss carry-forward %d', (carryForward) => {
      expect(() => openTaxYear(2030, carryForward)).toThrow(/loss carry-forward/);
    });
  });

  describe('taxTransactionType', () => {
    it.each([
      [1, 'tax'],
      [-1, 'tax-refund'],
      [0, null],
    ])('books %d as %s', (delta, type) => {
      expect(taxTransactionType(delta)).toBe(type);
    });
  });
});
