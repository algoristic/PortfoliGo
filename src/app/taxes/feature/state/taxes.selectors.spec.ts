import { TaxYear } from '@app/taxes/domain/models/tax.model';

import {
  selectCurrentTaxSummary,
  selectSaleTaxPreview,
  selectTaxOverview,
} from './taxes.selectors';

// TS §7.7, table "Verkäufe, Zinsen und Verlustvortrag": 2030 closed, 2031 after its first sale.
const YEAR_2030: TaxYear = {
  year: 2030,
  lossCarryForward: 0,
  income: -40_000,
  withheld: 0,
  interest: 40_000,
  distributions: 0,
  gains: 150_000,
  losses: -230_000,
  paid: 22_500,
  refunded: 22_500,
};
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
const YEAR_2032: TaxYear = { ...YEAR_2031, year: 2032, lossCarryForward: 0, income: 0, gains: 0 };

describe('taxes selectors', () => {
  describe('selectTaxOverview', () => {
    it('lists the running year first, then the closed years newest first (US-ST-04)', () => {
      const overview = selectTaxOverview.projector(YEAR_2032, [YEAR_2030, YEAR_2031]);
      expect(overview.map(({ year }) => year)).toEqual([2032, 2031, 2030]);
      expect(overview[2]).toEqual({
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
      });
      expect(overview[1]).toMatchObject({
        lossCarryForwardIn: -40_000,
        usedAllowance: 90_000,
        lossCarryForwardOut: 0,
      });
    });

    it('is empty until the first projection', () => {
      expect(selectTaxOverview.projector(null, [])).toEqual([]);
      expect(selectCurrentTaxSummary.projector(null)).toBeNull();
    });
  });

  describe('selectSaleTaxPreview', () => {
    // TS §7.6: lots 10 for 1.013,00 € and 5 for 520,00 €; 2031 after its first sale: net 900 €.
    const lots = [
      { buyTick: 0, quantity: 10_000_000, cost: 101_300 },
      { buyTick: 1, quantity: 5_000_000, cost: 52_000 },
    ];

    it('previews the sale on the running tax year (US-HD-02)', () => {
      // 4 shares for 450,00 €: 405,20 € cost, 44,80 € gain, still within the allowance.
      expect(selectSaleTaxPreview(lots, 4_000_000, 45_000).projector(YEAR_2031)).toEqual({
        costBasis: 40_520,
        realizedGain: 4_480,
        tax: 0,
        net: 45_000,
      });
      // All 15 shares for 2.533,00 €: 1.000,00 € gain, net 1.900 €, 25 % of 900 €.
      expect(selectSaleTaxPreview(lots, 15_000_000, 253_300).projector(YEAR_2031)).toEqual({
        costBasis: 153_300,
        realizedGain: 100_000,
        tax: 22_500,
        net: 230_800,
      });
    });

    it.each([
      ['no tax year yet', 1_000_000, null],
      ['more shares than the lots hold', 15_000_001, YEAR_2031],
      ['no shares', 0, YEAR_2031],
      ['part of a millionth', 0.5, YEAR_2031],
    ])('gives null for %s', (_case, quantity, year) => {
      expect(selectSaleTaxPreview(lots, quantity, 10_000).projector(year)).toBeNull();
    });
  });
});
