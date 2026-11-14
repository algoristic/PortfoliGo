import fc from 'fast-check';

import { FeeModel } from '@app/banking/domain/models/bank-conditions.model';

import { SavingsPlanFailure, SavingsPlanSpec } from './models/savings-plan.model';
import {
  savingsPlanChangeError,
  savingsPlanCosts,
  savingsPlanError,
  savingsPlanFailure,
  savingsPlanFill,
  savingsPlanId,
  savingsPlanPreview,
  savingsPlanQuantity,
  savingsPlanTarget,
  savingsPlanTransaction,
} from './savings-plan-logic';

import { arbFeeModel } from '../../../testing/arbitraries';

const FREE: FeeModel = { kind: 'free' };
const PERCENT: FeeModel = { kind: 'percent', rate: 0.015 };
const FLAT: FeeModel = { kind: 'flat', amount: 150 };

const SPEC: SavingsPlanSpec = { depotId: 'dep-2', instrumentId: 'etf-1', amount: 5_000, day: 15 };
const TARGET = { depot: { closedAt: null }, eligible: true, fee: PERCENT };

describe('savings-plan-logic', () => {
  describe('savingsPlanId', () => {
    it('numbers savings plans from 1', () => {
      expect(savingsPlanId(1)).toBe('sp-1');
      expect(savingsPlanId(12)).toBe('sp-12');
      expect(() => savingsPlanId(0)).toThrow(RangeError);
      expect(() => savingsPlanId(1.5)).toThrow(RangeError);
    });
  });

  describe('savingsPlanError', () => {
    // TS §7.8: checks in this order
    it.each<[string, Partial<SavingsPlanSpec>, Partial<typeof TARGET> | object, string | null]>([
      ['a valid plan', {}, {}, null],
      ['day 1 and 1,00 € without costs', { day: 1, amount: 100 }, { fee: FREE }, null],
      ['day 28', { day: 28 }, {}, null],
      ['an unknown depot', {}, { depot: null, fee: null }, 'unknown-depot'],
      ['a closed depot', {}, { depot: { closedAt: 5 } }, 'depot-closed'],
      ['an unknown instrument', {}, { eligible: null }, 'unknown-instrument'],
      ['an instrument that is not eligible', {}, { eligible: false }, 'not-savings-plan-eligible'],
      ['0 cents', { amount: 0 }, {}, 'invalid-amount'],
      ['a fraction of a cent', { amount: 150.5 }, {}, 'invalid-amount'],
      ['0,99 €', { amount: 99 }, { fee: FREE }, 'amount-too-small'],
      ['costs equal to the amount', { amount: 150 }, { fee: FLAT }, 'amount-too-small'],
      ['one cent above the costs', { amount: 151 }, { fee: FLAT }, null],
      ['day 0', { day: 0 }, {}, 'invalid-day'],
      ['day 29', { day: 29 }, {}, 'invalid-day'],
      ['day 14.5', { day: 14.5 }, {}, 'invalid-day'],
      ['a closed depot and day 29', { day: 29 }, { depot: { closedAt: 5 } }, 'depot-closed'],
    ])('returns the code for %s', (_name, spec, target, expected) => {
      expect(savingsPlanError({ ...SPEC, ...spec }, { ...TARGET, ...target })).toBe(expected);
    });

    it('checks a change like a new plan without depot and instrument', () => {
      expect(savingsPlanChangeError({ amount: 2_500, day: 3 }, FLAT)).toBeNull();
      expect(savingsPlanChangeError({ amount: 2_500, day: 29 }, FLAT)).toBe('invalid-day');
      expect(savingsPlanChangeError({ amount: 100, day: 3 }, FLAT)).toBe('amount-too-small');
    });
  });

  describe('savingsPlanTarget', () => {
    it('looks up depot, eligibility and costs', () => {
      const depots = [{ id: 'dep-2' as const, bankId: 'b1', closedAt: null }];
      const fees = new Map([['b1', FLAT]]);
      expect(savingsPlanTarget(SPEC, depots, fees, () => true)).toEqual({
        depot: depots[0],
        eligible: true,
        fee: FLAT,
      });
      expect(savingsPlanTarget({ ...SPEC, depotId: 'dep-4' }, depots, fees, () => null)).toEqual({
        depot: null,
        eligible: null,
        fee: null,
      });
    });
  });

  describe('savingsPlanFill', () => {
    // TS §7.8: Stück = (Betrag − Kosten) / Brief, on millionths
    it.each<[number, FeeModel, number, number, number, number, number]>([
      [10_000, FREE, 37.52, 0, 2_665_245, 10_000, 10_000],
      [5_000, PERCENT, 120, 75, 410_416, 4_925, 5_000],
      [2_500, FLAT, 250.05, 150, 93_981, 2_350, 2_500],
      [1_000, FREE, 3, 0, 3_333_333, 1_000, 1_000],
      [100, FREE, 1_250_000, 0, 0, 0, 0],
    ])(
      'buys %d cents with %o at %d: costs %d, %d millionths, value %d, debit %d',
      (amount, fee, ask, costs, quantity, value, total) => {
        expect(savingsPlanFill(amount, ask, fee)).toEqual({
          quantity,
          price: ask,
          marketValue: value,
          costs,
          total,
        });
      },
    );

    it('rejects a price that is not positive', () => {
      expect(() => savingsPlanQuantity(100, 0)).toThrow(RangeError);
      expect(() => savingsPlanQuantity(100, Number.NaN)).toThrow(RangeError);
    });

    it('buys nothing with an empty budget', () => {
      expect(savingsPlanQuantity(0, 10)).toBe(0);
      expect(savingsPlanQuantity(-5, 10)).toBe(0);
    });

    it('never debits more than the amount and buys as many millionths as fit', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 10_000_000 }),
          fc.integer({ min: 1, max: 100_000_000 }).map((grid) => grid / 10_000),
          arbFeeModel(),
          (amount, ask, fee) => {
            const fill = savingsPlanFill(amount, ask, fee);
            expect(fill.costs).toBe(savingsPlanCosts(fee, amount));
            expect(Number.isSafeInteger(fill.quantity)).toBe(true);
            if (fill.costs >= amount) {
              expect(fill.quantity).toBe(0);
              return;
            }
            // Exact rational check with BigInt: ask has at most four decimals.
            const askTenThousandths = BigInt(Math.round(ask * 10_000));
            const budget = BigInt(amount - fill.costs) * 100_000_000n;
            expect(BigInt(fill.quantity) * askTenThousandths <= budget).toBe(true);
            expect(BigInt(fill.quantity + 1) * askTenThousandths > budget).toBe(true);
            expect(fill.total).toBeLessThanOrEqual(amount);
            expect(fill.total).toBe(fill.marketValue + fill.costs);
          },
        ),
      );
    });
  });

  describe('savingsPlanFailure', () => {
    // TS §7.8: price floor, then cover of the whole amount, then a fill without shares
    it.each<[string, boolean, number, number, SavingsPlanFailure | null]>([
      ['a covered plan', false, 10_000, 1, null],
      ['exactly the amount available', false, 5_000, 1, null],
      ['one cent missing', false, 4_999, 1, 'insufficient-funds'],
      ['the price floor', true, 10_000, 1, 'price-floor'],
      ['the price floor without cover', true, 0, 1, 'price-floor'],
      ['nothing bought', false, 10_000, 0, 'amount-too-small'],
      ['nothing bought without cover', false, 0, 0, 'insufficient-funds'],
    ])('returns the reason for %s', (_name, atPriceFloor, available, quantity, expected) => {
      expect(savingsPlanFailure(5_000, { quantity }, { atPriceFloor, available })).toBe(expected);
    });
  });

  describe('savingsPlanTransaction', () => {
    it('books a purchase against the market and the bank with the plan as reference', () => {
      const fill = savingsPlanFill(5_000, 120, PERCENT);
      expect(
        savingsPlanTransaction(
          { id: 'sp-3', depotId: 'dep-2', instrumentId: 'etf-1' },
          fill,
          { clearingAccountId: 'acc-3', bankId: 'b4' },
          77,
        ),
      ).toEqual({
        tick: 77,
        type: 'buy',
        postings: [
          { account: 'acc-3', amount: -5_000 },
          { account: 'external:market', amount: 4_925 },
          { account: 'external:bank:b4:fees', amount: 75 },
        ],
        units: [{ depotId: 'dep-2', instrumentId: 'etf-1', quantity: 410_416 }],
        refs: { savingsPlanId: 'sp-3', instrumentId: 'etf-1' },
        params: {
          quantity: 410_416,
          price: 120,
          marketValue: 4_925,
          orderFee: 75,
          exchangeFee: 0,
        },
      });
    });

    it('leaves out the fee posting without costs', () => {
      const draft = savingsPlanTransaction(
        { id: 'sp-1', depotId: 'dep-2', instrumentId: 'etf-1' },
        savingsPlanFill(1_000, 3, FREE),
        { clearingAccountId: 'acc-3', bankId: 'b4' },
        1,
      );
      expect(draft.postings).toEqual([
        { account: 'acc-3', amount: -1_000 },
        { account: 'external:market', amount: 1_000 },
      ]);
    });
  });

  describe('savingsPlanPreview', () => {
    it('shows costs, shares at the ask and whether the clearing account covers the amount', () => {
      expect(savingsPlanPreview(5_000, 120, PERCENT, 8_000, 2_000)).toEqual({
        costs: 75,
        quantity: 410_416,
        available: 6_000,
        covered: true,
      });
      expect(savingsPlanPreview(5_000, null, PERCENT, 8_000, 3_001)).toEqual({
        costs: 75,
        quantity: null,
        available: 4_999,
        covered: false,
      });
      expect(savingsPlanPreview(5_000, 120, FREE, -300, 0).available).toBe(0);
    });
  });
});
