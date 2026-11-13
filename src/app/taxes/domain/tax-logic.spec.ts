import fc from 'fast-check';

import { TaxableIncomeKind, TaxYear } from './models/tax.model';
import {
  assessTaxableIncome,
  closeTaxYear,
  netTaxableIncome,
  openTaxYear,
  saleTaxPreview,
  taxDue,
  taxPreview,
  taxTransactionType,
  taxYearSummary,
} from './tax-logic';

type TaxEvent = number | [number, TaxableIncomeKind] | 'year-end';

/**
 * Runs events through the year; `'year-end'` closes it. A plain number is credit interest, or a
 * sale when negative. Returns each delta and the closed years.
 */
function run(
  state: TaxYear,
  events: TaxEvent[],
): { state: TaxYear; deltas: number[]; closed: TaxYear[] } {
  const deltas: number[] = [];
  const closed: TaxYear[] = [];
  for (const event of events) {
    if (event === 'year-end') {
      closed.push(state);
      state = closeTaxYear(state);
      continue;
    }
    const [amount, kind] =
      typeof event === 'number' ? [event, event < 0 ? 'sale' : 'interest'] : event;
    const assessment = assessTaxableIncome(state, amount, kind as TaxableIncomeKind);
    state = assessment.state;
    deltas.push(assessment.delta);
  }
  return { state, deltas, closed };
}

/** A tax year with the given fields, the others as `openTaxYear` leaves them. */
function year(fields: Partial<TaxYear> & { year: number }): TaxYear {
  return { ...openTaxYear(fields.year), ...fields };
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
      expect(state).toEqual(
        year({
          year: 2030,
          income: 21_699,
          interest: 121_699,
          losses: -100_000,
          paid: 5_425,
          refunded: 5_425,
        }),
      );
      expect(closeTaxYear(state)).toEqual(openTaxYear(2031));
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
      expect(state).toEqual(
        year({
          year: 2031,
          lossCarryForward: -250_000,
          income: 400_000,
          withheld: 12_500,
          interest: 400_000,
          paid: 12_500,
        }),
      );
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
            const { delta } = assessTaxableIncome(state, amount, 'sale');
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
      expect(() => assessTaxableIncome(openTaxYear(2030), 0.5, 'sale')).toThrow(/whole cents: 0.5/);
    });

    it.each(['interest', 'distribution'] as const)('rejects negative %s', (kind) => {
      expect(() => assessTaxableIncome(openTaxYear(2030), -1, kind)).toThrow(/negative: -1/);
      expect(assessTaxableIncome(openTaxYear(2030), 0, kind).delta).toBe(0);
    });

    it('leaves its input unchanged', () => {
      const state = openTaxYear(2030);
      assessTaxableIncome(state, 200_000, 'sale');
      expect(state).toEqual(openTaxYear(2030));
    });

    it('sorts the income by kind and sums withholdings and refunds', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1e8, max: 0 }),
          fc.array(
            fc.oneof(
              fc.tuple(fc.integer({ min: -1e7, max: 1e7 }), fc.constant('sale' as const)),
              fc.tuple(
                fc.integer({ min: 0, max: 1e7 }),
                fc.constantFrom('interest' as const, 'distribution' as const),
              ),
            ),
            { maxLength: 30 },
          ),
          (carryForward, events) => {
            const { state, deltas } = run(openTaxYear(2030, carryForward), events);
            const sum = (values: number[]): number =>
              values.reduce((total, value) => total + value, 0);
            const of = (kind: TaxableIncomeKind): number[] =>
              events.filter(([, k]) => k === kind).map(([amount]) => amount);
            expect(state.interest).toBe(sum(of('interest')));
            expect(state.distributions).toBe(sum(of('distribution')));
            expect(state.gains).toBe(sum(of('sale').filter((amount) => amount > 0)));
            expect(state.losses).toBe(sum(of('sale').filter((amount) => amount < 0)));
            expect(state.interest + state.distributions + state.gains + state.losses).toBe(
              state.income,
            );
            expect(state.paid).toBe(sum(deltas.filter((delta) => delta > 0)));
            expect(state.refunded).toBe(
              sum(deltas.filter((delta) => delta < 0).map((delta) => -delta)),
            );
            expect(state.paid - state.refunded).toBe(state.withheld);
          },
        ),
      );
    });
  });

  describe('sales, distributions and the year end (TS §7.7, AP 5.3)', () => {
    // TS §7.7: sales with interest, mixed, over the year end (table "Verkäufe, Zinsen und
    // Verlustvortrag")
    it('refunds losses and carries the rest into the next year', () => {
      const { state, deltas, closed } = run(openTaxYear(2030), [
        [40_000, 'interest'],
        [150_000, 'sale'],
        [-60_000, 'sale'],
        [-80_000, 'sale'],
        [-90_000, 'sale'],
        'year-end',
        [130_000, 'sale'],
        [50_000, 'sale'],
      ]);
      expect(deltas).toEqual([0, 22_500, -15_000, -7_500, 0, 0, 10_000]);
      expect(closed.map(taxYearSummary)).toEqual([
        {
          year: 2030,
          interest: 40_000,
          distributions: 0,
          gains: 150_000,
          losses: -230_000,
          income: -40_000,
          lossCarryForwardIn: 0,
          usedAllowance: 0,
          paid: 22_500,
          refunded: 22_500,
          withheld: 0,
          lossCarryForwardOut: -40_000,
        },
      ]);
      expect(taxYearSummary(state)).toEqual({
        year: 2031,
        interest: 0,
        distributions: 0,
        gains: 180_000,
        losses: 0,
        income: 180_000,
        lossCarryForwardIn: -40_000,
        usedAllowance: 100_000,
        paid: 10_000,
        refunded: 0,
        withheld: 10_000,
        lossCarryForwardOut: 0,
      });
    });

    // TS §7.7: only gains and distributions; the unused allowance lapses (table "Nur Gewinne")
    it('lets the unused allowance of a year with gains and distributions lapse', () => {
      const { state, deltas, closed } = run(openTaxYear(2030), [
        [60_000, 'sale'],
        [30_000, 'distribution'],
        'year-end',
        [140_000, 'sale'],
        [20_000, 'distribution'],
      ]);
      expect(deltas).toEqual([0, 0, 10_000, 5_000]);
      expect(taxYearSummary(closed[0])).toMatchObject({
        distributions: 30_000,
        gains: 60_000,
        income: 90_000,
        usedAllowance: 90_000,
        paid: 0,
        lossCarryForwardOut: 0,
      });
      expect(state.lossCarryForward).toBe(0);
      expect(taxYearSummary(state)).toMatchObject({
        distributions: 20_000,
        gains: 140_000,
        usedAllowance: 100_000,
        paid: 15_000,
      });
    });

    // TS §7.7: only losses (table "Nur Verluste")
    it('carries losses over several years without booking', () => {
      const { state, deltas, closed } = run(openTaxYear(2030), [
        [-60_000, 'sale'],
        [-80_000, 'sale'],
        'year-end',
        'year-end',
      ]);
      expect(deltas).toEqual([0, 0]);
      expect(closed.map(taxYearSummary)).toEqual([
        expect.objectContaining({
          year: 2030,
          losses: -140_000,
          lossCarryForwardIn: 0,
          lossCarryForwardOut: -140_000,
          paid: 0,
          refunded: 0,
        }),
        expect.objectContaining({
          year: 2031,
          income: 0,
          lossCarryForwardIn: -140_000,
          usedAllowance: 0,
          lossCarryForwardOut: -140_000,
        }),
      ]);
      expect(state).toEqual(openTaxYear(2032, -140_000));
    });
  });

  describe('taxPreview', () => {
    // TS §7.7: example 2030 after event 4 (net 1.216,99 €, 54,25 € withheld)
    it.each([
      [100_000, 25_000],
      [-100_000, -5_425],
      [-10_000, -2_500],
      [0, 0],
    ])('previews a realized gain of %d cents as %d cents tax', (gain, tax) => {
      const state = run(openTaxYear(2030), [40_000, 50_000, 30_000, 1_699]).state;
      expect(taxPreview(state, gain)).toBe(tax);
      expect(state.withheld).toBe(5_425);
    });
  });

  describe('saleTaxPreview', () => {
    // TS §7.6 partial sales (lots 10 for 1.013,00 € and 5 for 520,00 €), TS §7.7 example tax year
    // after event 3 (net 1.200,00 €, 50,00 € withheld)
    const lots = [
      { buyTick: 0, quantity: 10_000_000, cost: 101_300 },
      { buyTick: 1, quantity: 5_000_000, cost: 52_000 },
    ];
    const state = run(openTaxYear(2030), [40_000, 50_000, 30_000]).state;

    it.each([
      [4_000_000, 45_000, { costBasis: 40_520, realizedGain: 4_480, tax: 1_120, net: 43_880 }],
      [12_000_000, 70_000, { costBasis: 122_100, realizedGain: -52_100, tax: -5_000, net: 75_000 }],
    ])('previews selling %d millionths for %d cents', (quantity, proceeds, preview) => {
      expect(saleTaxPreview(state, lots, quantity, proceeds)).toEqual(preview);
    });

    it('throws when the lots hold fewer shares', () => {
      expect(() => saleTaxPreview(state, lots, 16_000_000, 1)).toThrow(RangeError);
    });
  });

  describe('closeTaxYear', () => {
    it.each([
      [0, 150_000, 0],
      [0, -1, -1],
      [-250_000, 100_000, -150_000],
      [-250_000, 300_000, 0],
    ])('carries %d + %d cents forward as %d', (carryForward, income, next) => {
      const { state } = run(openTaxYear(2030, carryForward), [[income, 'sale']]);
      expect(closeTaxYear(state)).toEqual(openTaxYear(2031, next));
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
