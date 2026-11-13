import { dateTimeToTick, dayIndex } from '@app/clock/domain/calendar-logic';

import {
  distributionAmount,
  distributionPaymentTick,
  pendingDistributionsFor,
} from './distribution-logic';
import { PendingDistribution } from './models/distribution.model';

const SHARE = 1_000_000;

describe('distribution-logic', () => {
  describe('distributionAmount', () => {
    // TS §7.4: shares at the ex-date × amount per share, rounded half away from zero
    it.each([
      [10 * SHARE, 85, 850],
      [15_500_000, 85, 1_318],
      [1_500_000, 41, 62],
      [1_234_567, 100, 123],
      [500_000, 1, 1],
      [400_000, 1, 0],
      [0, 85, 0],
    ])('pays %d millionths × %d cents = %d cents', (quantity, cents, amount) => {
      expect(distributionAmount(quantity, cents)).toBe(amount);
    });
  });

  describe('distributionPaymentTick', () => {
    it('credits at 06:00 of the payment date', () => {
      const day = dayIndex(dateTimeToTick({ year: 2030, month: 4, day: 5 }));
      expect(distributionPaymentTick(day)).toBe(
        dateTimeToTick({ year: 2030, month: 4, day: 5, hour: 6 }),
      );
    });
  });

  describe('pendingDistributionsFor', () => {
    const base: PendingDistribution = {
      kind: 'dividend',
      depotId: 'dep-3',
      instrumentId: 'stk-0001',
      accountId: 'acc-2',
      quantity: SHARE,
      cents: 100,
      amount: 100,
      exTick: 0,
      paymentTick: 1,
    };

    it('sums the payouts still to be credited to the account', () => {
      const pending = [
        base,
        { ...base, amount: 250 },
        { ...base, accountId: 'acc-1' as const, amount: 999 },
      ];
      expect(pendingDistributionsFor(pending, 'acc-2')).toBe(350);
      expect(pendingDistributionsFor(pending, 'acc-1')).toBe(999);
      expect(pendingDistributionsFor(pending, 'acc-7')).toBe(0);
    });
  });
});
