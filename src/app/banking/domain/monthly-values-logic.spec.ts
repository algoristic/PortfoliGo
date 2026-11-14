import fc from 'fast-check';

import { MonthlyValues } from './models/household.model';
import { PostingDraft, TextParams, TransactionType } from './models/ledger.model';
import {
  addTerCosts,
  addToMonthlyValues,
  emptyMonthlyValues,
  monthlyEarnings,
  monthlySpending,
  savingsRate,
} from './monthly-values-logic';

interface Booking {
  type: TransactionType;
  postings: PostingDraft[];
  refs?: Record<string, string>;
  params?: TextParams;
}

function booking(type: TransactionType, ...postings: [PostingDraft['account'], number][]): Booking {
  return { type, postings: postings.map(([account, amount]) => ({ account, amount })) };
}

// TS §7.2 journal 1–6 plus overdraft interest of 0.52 €
const APRIL_2030: Booking[] = [
  booking('opening-balance', ['acc-1', 1_000_000], ['external:opening-balance', -1_000_000]),
  booking('living-costs', ['acc-1', -184_327], ['external:living-costs', 184_327]),
  booking('transfer', ['acc-1', -300_000], ['acc-2', 300_000]),
  booking('account-fee', ['acc-1', -990], ['external:bank:b1:fees', 990]),
  booking('credit-interest', ['acc-2', 548], ['external:bank:b2:interest', -548]),
  booking('salary', ['acc-1', 250_000], ['external:employer', -250_000]),
  booking('overdraft-interest', ['acc-1', -52], ['external:bank:b1:interest', 52]),
];

function sum(bookings: readonly Booking[]): MonthlyValues {
  return bookings.reduce(addToMonthlyValues, emptyMonthlyValues());
}

const values = (partial: Partial<MonthlyValues>): MonthlyValues => ({
  ...emptyMonthlyValues(),
  ...partial,
});

describe('monthly-values-logic', () => {
  describe('addToMonthlyValues', () => {
    // TS §7.4: monthly values of April 2030
    it('sums the example month', () => {
      expect(sum(APRIL_2030)).toEqual({
        income: 250_000,
        livingCosts: 184_327,
        fees: 990,
        creditInterest: 548,
        debitInterest: 52,
        taxes: 0,
        dividends: 0,
        orderFees: 0,
        savingsPlanFees: 0,
        accountFees: 990,
        custodyFees: 0,
        spreadCosts: 0,
        terCosts: 0,
      });
    });

    // TS §7.4: classification by counterparty
    it.each<[string, Booking, Partial<MonthlyValues>]>([
      ['a tax', booking('tax', ['acc-2', -137], ['external:tax-office', 137]), { taxes: 137 }],
      [
        'a tax refund',
        booking('tax-refund', ['acc-2', 5_425], ['external:tax-office', -5_425]),
        { taxes: -5_425 },
      ],
      [
        'debit interest on a clearing account',
        booking('debit-interest', ['acc-4', -1_479], ['external:bank:b3:interest', 1_479]),
        { debitInterest: 1_479 },
      ],
      [
        'a dividend with tax withheld',
        booking(
          'dividend',
          ['acc-4', 7_500],
          ['external:issuer:i1', -10_000],
          ['external:tax-office', 2_500],
        ),
        { dividends: 10_000, taxes: 2_500 },
      ],
      [
        'a buy with an order fee and its spread',
        {
          ...booking(
            'buy',
            ['acc-4', -100_590],
            ['external:market', 100_000],
            ['external:bank:b3:fees', 590],
          ),
          refs: { orderId: 'ord-1' },
          params: { orderFee: 400, exchangeFee: 190, spreadCost: 75 },
        },
        { fees: 590, orderFees: 590, spreadCosts: 75 },
      ],
      [
        'a sale with an order fee and no estimate',
        booking(
          'sell',
          ['acc-4', 49_510],
          ['external:market', -50_000],
          ['external:bank:b3:fees', 490],
        ),
        { fees: 490, orderFees: 490 },
      ],
      [
        'a sale without fees',
        {
          ...booking('sell', ['acc-4', 50_000], ['external:market', -50_000]),
          params: { spreadCost: 30 },
        },
        { spreadCosts: 30 },
      ],
      [
        'a savings plan execution',
        {
          ...booking(
            'buy',
            ['acc-4', -5_000],
            ['external:market', 4_925],
            ['external:bank:b3:fees', 75],
          ),
          refs: { savingsPlanId: 'sp-1' },
          params: { spreadCost: 5 },
        },
        { fees: 75, savingsPlanFees: 75, spreadCosts: 5 },
      ],
      [
        'a custody fee',
        booking('custody-fee', ['acc-4', -1_190], ['external:bank:b3:fees', 1_190]),
        { fees: 1_190, custodyFees: 1_190 },
      ],
      [
        'an account fee',
        booking('account-fee', ['acc-1', -490], ['external:bank:b1:fees', 490]),
        { fees: 490, accountFees: 490 },
      ],
      [
        'a spread parameter on another type',
        { ...booking('transfer', ['acc-1', -1], ['acc-2', 1]), params: { spreadCost: 9 } },
        {},
      ],
      ['a transfer', booking('transfer', ['acc-1', -300_000], ['acc-2', 300_000]), {}],
      [
        'the opening balance',
        booking('opening-balance', ['acc-1', 1_000_000], ['external:opening-balance', -1_000_000]),
        {},
      ],
    ])('counts %s', (_case, transaction, expected) => {
      expect(addToMonthlyValues(emptyMonthlyValues(), transaction)).toEqual(values(expected));
    });

    it('does not depend on the order of the transactions', () => {
      fc.assert(
        fc.property(
          fc.shuffledSubarray(APRIL_2030, { minLength: APRIL_2030.length }),
          (shuffled) => {
            expect(sum(shuffled)).toEqual(sum(APRIL_2030));
          },
        ),
      );
    });
  });

  describe('addTerCosts', () => {
    // TS §7.4: estimated TER costs stay unrounded and outside fees and spending
    it('adds the unrounded costs of a day', () => {
      const day = addTerCosts(values({ terCosts: 0.25 }), 1.369_863);
      expect(day.terCosts).toBeCloseTo(1.619_863, 9);
      expect(monthlySpending(day)).toBe(0);
    });

    it('keeps the values of a day without ETFs', () => {
      const before = values({ income: 1 });
      expect(addTerCosts(before, 0)).toBe(before);
    });
  });

  describe('savingsRate', () => {
    // TS §7.4: savings rate
    it.each<[string, Partial<MonthlyValues>, number | null]>([
      [
        'the example month',
        {
          income: 250_000,
          livingCosts: 184_327,
          fees: 990,
          creditInterest: 548,
          debitInterest: 52,
        },
        0.2601,
      ],
      ['spending above income', { income: 100_000, livingCosts: 150_000 }, -0.5],
      ['no earnings', { livingCosts: 150_000 }, null],
      ['a tax refund', { income: 200_000, taxes: -10_000 }, 1.05],
      ['dividends only', { dividends: 10_000, taxes: 2_500 }, 0.75],
    ])('computes %s', (_case, partial, rate) => {
      const result = savingsRate(values(partial));
      if (rate === null) {
        expect(result).toBeNull();
      } else {
        expect(result).toBeCloseTo(rate, 4);
      }
    });

    it('returns null when the earnings are not positive', () => {
      expect(savingsRate(values({ creditInterest: 0 }))).toBeNull();
      expect(savingsRate(values({ income: -1 }))).toBeNull();
    });

    it('splits earnings and spending as in the spec', () => {
      const all = values({
        income: 1,
        livingCosts: 10,
        fees: 100,
        creditInterest: 1_000,
        debitInterest: 10_000,
        taxes: 100_000,
        dividends: 1_000_000,
      });
      expect(monthlyEarnings(all)).toBe(1_001_001);
      expect(monthlySpending(all)).toBe(110_110);
    });
  });
});
