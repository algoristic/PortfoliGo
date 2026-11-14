import fc from 'fast-check';

import { incomeAndCosts } from './income-costs-logic';
import { ClosedMonth, MonthlyValues } from './models/household.model';

const ZERO: MonthlyValues = {
  income: 0,
  livingCosts: 0,
  fees: 0,
  creditInterest: 0,
  debitInterest: 0,
  taxes: 0,
  dividends: 0,
  orderFees: 0,
  savingsPlanFees: 0,
  accountFees: 0,
  custodyFees: 0,
  spreadCosts: 0,
  terCosts: 0,
};

function month(year: number, number: number, values: Partial<MonthlyValues>): ClosedMonth {
  return { month: { year, month: number }, values: { ...ZERO, ...values } };
}

// TS §7.4: earnings and costs, example table (November 2030 to the running January 2031)
const NOVEMBER = month(2030, 11, {
  income: 250_000,
  dividends: 1_200,
  creditInterest: 300,
  orderFees: 990,
  savingsPlanFees: 75,
  accountFees: 490,
  debitInterest: 52,
  spreadCosts: 40,
  terCosts: 10.4,
});
const DECEMBER = month(2030, 12, {
  creditInterest: 310,
  savingsPlanFees: 75,
  accountFees: 490,
  custodyFees: 1_190,
  spreadCosts: 5,
  terCosts: 10.4,
});
const JANUARY = month(2031, 1, { dividends: 500, accountFees: 490, terCosts: 3.3 });

describe('incomeAndCosts', () => {
  it('sums the example table per year, the newest first', () => {
    expect(incomeAndCosts([NOVEMBER, DECEMBER], JANUARY)).toEqual([
      {
        year: 2031,
        running: true,
        months: [{ month: { year: 2031, month: 1 }, dividends: 500, creditInterest: 0 }],
        dividends: 500,
        creditInterest: 0,
        costs: {
          orderFees: 0,
          savingsPlanFees: 0,
          accountFees: 490,
          custodyFees: 0,
          debitInterest: 0,
          spreadCosts: 0,
          terCosts: 3,
        },
        totalCosts: 493,
        estimatedCosts: 3,
      },
      {
        year: 2030,
        running: false,
        months: [
          { month: { year: 2030, month: 12 }, dividends: 0, creditInterest: 310 },
          { month: { year: 2030, month: 11 }, dividends: 1_200, creditInterest: 300 },
        ],
        dividends: 1_200,
        creditInterest: 610,
        costs: {
          orderFees: 990,
          savingsPlanFees: 150,
          accountFees: 980,
          custodyFees: 1_190,
          debitInterest: 52,
          spreadCosts: 45,
          // 10,4 + 10,4 = 20,8 cents, rounded once per year
          terCosts: 21,
        },
        totalCosts: 3_428,
        estimatedCosts: 66,
      },
    ]);
  });

  it('has no years without months', () => {
    expect(incomeAndCosts([], null)).toEqual([]);
  });

  it('marks no year as running without the running month', () => {
    expect(incomeAndCosts([NOVEMBER], null).map(({ running }) => running)).toEqual([false]);
  });

  it('keeps every month and its earnings', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({
            year: fc.integer({ min: 2030, max: 2034 }),
            month: fc.integer({ min: 1, max: 12 }),
            dividends: fc.integer({ min: 0, max: 1e7 }),
          }),
          { selector: ({ year, month: number }) => year * 100 + number, maxLength: 40 },
        ),
        (entries) => {
          const months = entries.map(({ year, month: number, dividends }) =>
            month(year, number, { dividends }),
          );
          const years = incomeAndCosts(months, null);
          expect(years.flatMap((year) => year.months)).toHaveLength(months.length);
          expect(years.reduce((sum, year) => sum + year.dividends, 0)).toBe(
            entries.reduce((sum, { dividends }) => sum + dividends, 0),
          );
          for (const year of years) {
            expect(year.months.every(({ month: { year: y } }) => y === year.year)).toBe(true);
          }
        },
      ),
    );
  });
});
