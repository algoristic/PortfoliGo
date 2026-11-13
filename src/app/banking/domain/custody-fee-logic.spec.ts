import {
  accrueCustodyDay,
  averageDepotValue,
  closeCustodyQuarter,
  closingCustodyFees,
  daysInQuarter,
  openCustodyAccrual,
  quarterCustodyFee,
  quarterMonths,
} from './custody-fee-logic';
import { CustodyFee } from './models/bank-conditions.model';
import { CalendarMonth, CustodyAccrual } from './models/household.model';

const PERCENT: CustodyFee = { kind: 'percent-pa', rate: 0.002, min: 3_000, max: 15_000 };
const FLAT: CustodyFee = { kind: 'flat-pa', amount: 5_000 };
const MAY_2030: CalendarMonth = { year: 2030, month: 5 };

function accrual(values: Partial<CustodyAccrual>): CustodyAccrual {
  return { ...openCustodyAccrual('dep-3'), ...values };
}

describe('custody-fee-logic', () => {
  describe('quarterMonths and daysInQuarter', () => {
    it.each<[CalendarMonth, CalendarMonth, CalendarMonth, number]>([
      [{ year: 2030, month: 4 }, { year: 2030, month: 4 }, { year: 2030, month: 6 }, 91],
      [{ year: 2030, month: 6 }, { year: 2030, month: 4 }, { year: 2030, month: 6 }, 91],
      [{ year: 2030, month: 8 }, { year: 2030, month: 7 }, { year: 2030, month: 9 }, 92],
      [{ year: 2030, month: 12 }, { year: 2030, month: 10 }, { year: 2030, month: 12 }, 92],
      [{ year: 2031, month: 2 }, { year: 2031, month: 1 }, { year: 2031, month: 3 }, 90],
      [{ year: 2032, month: 3 }, { year: 2032, month: 1 }, { year: 2032, month: 3 }, 91],
    ])('puts %j into %j–%j with %d days', (month, from, to, days) => {
      expect(quarterMonths(month)).toEqual({ from, to });
      expect(daysInQuarter(month)).toBe(days);
    });
  });

  describe('averageDepotValue', () => {
    it.each([
      [91 * 4_000_000, 91, 4_000_000],
      [10_000 + 10_001, 2, 10_001],
      [39 * 1_000_000, 40, 975_000],
      [5, 3, 2],
      [0, 0, 0],
    ])('averages %d over %d days to %d', (sum, days, expected) => {
      expect(averageDepotValue(sum, days)).toBe(expected);
    });
  });

  describe('quarterCustodyFee', () => {
    // TS §7.3, „Depotgebühr im Quartal“: 0,2 % p. a., min 30 €, max 150 € (yearly values)
    it.each<[string, CustodyFee, CalendarMonth, number, number, number, number]>([
      ['full 2nd quarter at 40.000 €', PERCENT, MAY_2030, 91 * 4_000_000, 91, 2_000, 4_000_000],
      [
        'opened 01.06.2030, 30 days at 40.000 €',
        PERCENT,
        MAY_2030,
        30 * 4_000_000,
        30,
        659,
        4_000_000,
      ],
      ['opened 01.06.2030, empty', PERCENT, MAY_2030, 0, 30, 247, 0],
      [
        'closed 10.05.2030, 39 days at 10.000 € and the empty closing day',
        PERCENT,
        MAY_2030,
        39 * 1_000_000,
        40,
        330,
        975_000,
      ],
      ['full quarter at 100.000 €', PERCENT, MAY_2030, 91 * 10_000_000, 91, 3_750, 10_000_000],
      ['flat 50 €, full quarter', FLAT, { year: 2030, month: 8 }, 0, 92, 1_250, 0],
      ['flat 50 €, opened 16.08.2030', FLAT, { year: 2030, month: 8 }, 0, 46, 625, 0],
      ['none', { kind: 'none' }, MAY_2030, 91 * 4_000_000, 91, 0, 4_000_000],
      ['no open day', PERCENT, MAY_2030, 0, 0, 0, 0],
    ])('charges %s', (_case, custody, quarter, sum, days, amount, averageValue) => {
      expect(quarterCustodyFee(custody, quarter, sum, days)).toEqual({
        from: { year: 2030, month: quarter.month <= 6 ? 4 : 7 },
        to: { year: 2030, month: quarter.month <= 6 ? 6 : 9 },
        days,
        averageValue,
        amount,
      });
    });
  });

  describe('closingCustodyFees', () => {
    it('charges the running quarter up to the empty closing day', () => {
      // TS §7.3: closed Fr 10.05.2030 after 39 days at 10.000 €
      expect(
        closingCustodyFees(PERCENT, accrual({ valueSum: 39_000_000, days: 39 }), MAY_2030),
      ).toEqual([
        {
          from: { year: 2030, month: 4 },
          to: { year: 2030, month: 6 },
          days: 40,
          averageValue: 975_000,
          amount: 330,
        },
      ]);
    });

    it('charges the past quarter too before the bank run has', () => {
      // Closed Mo 01.07.2030 at 05:59: the 2nd quarter waits for the bank run at 06:00.
      const charges = closingCustodyFees(
        PERCENT,
        accrual({ pendingValueSum: 91 * 4_000_000, pendingDays: 91 }),
        { year: 2030, month: 7 },
      );
      expect(charges.map(({ from, days, amount }) => [from.month, days, amount])).toEqual([
        [4, 91, 2_000],
        // 1 day of the 3rd quarter at the minimum: 30 € × 1 / 368 = 0,08 €
        [7, 1, 8],
      ]);
    });

    it('leaves out charges of 0', () => {
      expect(closingCustodyFees({ kind: 'none' }, accrual({ days: 10 }), MAY_2030)).toEqual([]);
    });
  });

  describe('accrual over a quarter end', () => {
    it('moves the running quarter to the pending one at the quarter start', () => {
      const entry = openCustodyAccrual('dep-3');
      accrueCustodyDay(entry, 1_000);
      accrueCustodyDay(entry, 2_000);
      closeCustodyQuarter(entry);
      accrueCustodyDay(entry, 500);
      expect(entry).toEqual({
        depotId: 'dep-3',
        valueSum: 500,
        days: 1,
        pendingValueSum: 3_000,
        pendingDays: 2,
      });
    });
  });
});
