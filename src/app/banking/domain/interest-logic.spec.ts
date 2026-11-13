import fc from 'fast-check';

import {
  bookedInterest,
  clearingAccountDailyInterest,
  dailyInterest,
  overdraftDailyInterest,
} from './interest-logic';

import { arbCents, arbRate } from '../../../testing/arbitraries';

const OVERDRAFT = { rate: 0.11, toleratedSurcharge: 0.04 };
const CLEARING = { clearingAccountRate: 0.015, clearingAccountDebitRate: 0.09 };
const LIMIT = 500_000;

/** Sums the daily interest of `days` days in day order, as the engine does. */
function accrue(days: number, daily: () => number): number {
  let sum = 0;
  for (let day = 0; day < days; day++) {
    sum += daily();
  }
  return sum;
}

describe('interest-logic', () => {
  // TS §7.3: interest examples, act/365 including a leap year and the overdraft tiers
  describe('dailyInterest', () => {
    it.each<[string, number, number, number, number, number | null]>([
      ['credit, one day', 1_000_000, 0.02, 1, 54.794521, null],
      ['credit, 31 days', 1_000_000, 0.02, 31, 1_698.630137, 1_699],
      ['credit, 365 days', 1_000_000, 0.02, 365, 20_000, 20_000],
      ['credit, leap year', 1_000_000, 0.02, 366, 20_054.794521, 20_055],
    ])('accrues %s', (_case, balance, rate, days, accrued, booked) => {
      const sum = accrue(days, () => dailyInterest(balance, rate));
      expect(sum).toBeCloseTo(accrued, 5);
      if (booked !== null) {
        expect(bookedInterest(sum)).toBe(booked);
      }
    });

    it('has the sign of the balance', () => {
      fc.assert(
        fc.property(
          arbCents(),
          arbRate().filter((rate) => rate >= 1e-4),
          (balance, rate) => {
            expect(Math.sign(dailyInterest(balance, rate))).toBe(Math.sign(balance));
          },
        ),
      );
    });
  });

  describe('clearingAccountDailyInterest', () => {
    it.each<[string, number, number, number, number]>([
      ['credit', 500_000, 30, 616.438356, 616],
      ['debit', -200_000, 30, -1_479.452055, -1_479],
    ])('accrues %s for 30 days', (_case, balance, days, accrued, booked) => {
      const sum = accrue(days, () => clearingAccountDailyInterest(balance, CLEARING));
      expect(sum).toBeCloseTo(accrued, 5);
      expect(bookedInterest(sum)).toBe(booked);
    });

    it('earns nothing on a zero balance', () => {
      expect(clearingAccountDailyInterest(0, CLEARING)).toBe(0);
    });
  });

  describe('overdraftDailyInterest', () => {
    it.each<[string, number, number, number, number]>([
      ['credit', 100_000, LIMIT, 1, 0],
      ['within the limit', -300_000, LIMIT, 1, -90.410959],
      ['at the limit', -500_000, LIMIT, 1, -150.684932],
      ['beyond the limit', -800_000, LIMIT, 1, -273.972603],
      ['beyond the limit, 30 days', -800_000, LIMIT, 30, -8_219.178082],
      ['without a limit', -100_000, 0, 1, -41.09589],
    ])('accrues %s', (_case, balance, limit, days, accrued) => {
      const sum = accrue(days, () => overdraftDailyInterest(balance, limit, OVERDRAFT));
      expect(sum).toBeCloseTo(accrued, 5);
    });

    it('books 30 days beyond the limit as −82.19 €', () => {
      expect(
        bookedInterest(accrue(30, () => overdraftDailyInterest(-800_000, LIMIT, OVERDRAFT))),
      ).toBe(-8_219);
    });

    it('is zero for credit and negative for debit', () => {
      fc.assert(
        fc.property(arbCents(), fc.integer({ min: 0, max: 1e9 }), (balance, limit) => {
          const interest = overdraftDailyInterest(balance, limit, OVERDRAFT);
          if (balance >= 0) {
            expect(interest).toBe(0);
          } else {
            expect(interest).toBeLessThan(0);
          }
        }),
      );
    });

    it('charges the base rate up to the limit and is continuous at it', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1e9 }),
          fc.integer({ min: 1, max: 1e9 }),
          (limit, depth) => {
            const within = Math.min(depth, limit);
            expect(overdraftDailyInterest(-within, limit, OVERDRAFT)).toBeCloseTo(
              (-within * OVERDRAFT.rate) / 365,
              6,
            );
            // One cent beyond the limit costs at most one cent at the raised rate.
            const atLimit = overdraftDailyInterest(-limit, limit, OVERDRAFT);
            const beyond = overdraftDailyInterest(-limit - 1, limit, OVERDRAFT);
            expect(atLimit - beyond).toBeCloseTo(0.15 / 365, 6);
          },
        ),
      );
    });

    it('grows with the depth of the overdraft', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1e9 }),
          fc.integer({ min: -1e9, max: 0 }),
          fc.integer({ min: 1, max: 1e6 }),
          (limit, balance, step) => {
            expect(overdraftDailyInterest(balance - step, limit, OVERDRAFT)).toBeLessThan(
              overdraftDailyInterest(balance, limit, OVERDRAFT),
            );
          },
        ),
      );
    });
  });

  describe('bookedInterest', () => {
    // TS §7.1: commercial rounding when interest is booked
    it.each([
      [1_698.630137, 1_699],
      [-1_479.452055, -1_479],
      [0.5, 1],
      [-0.5, -1],
      [0.4999, 0],
    ])('books %d as %d cents', (accrued, booked) => {
      expect(bookedInterest(accrued)).toBe(booked);
    });
  });
});
