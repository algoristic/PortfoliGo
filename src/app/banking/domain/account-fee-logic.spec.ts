import fc from 'fast-check';

import { dateTimeToTick, daysInMonth } from '@app/clock/domain/calendar-logic';

import { closingAccountFees, monthlyAccountFee, openDaysInMonth } from './account-fee-logic';
import { CurrentAccountConditions } from './models/bank-conditions.model';

import { arbCalendarMonth } from '../../../testing/arbitraries';

type FeeConditions = Pick<CurrentAccountConditions, 'monthlyFee' | 'feeWaiver'>;

const DIRECT: FeeConditions = { monthlyFee: 990, feeWaiver: { minMonthlyDeposits: 70_000 } };
const BRANCH: FeeConditions = { monthlyFee: 1_200 };
const EARLIER = dateTimeToTick({ year: 2029, month: 11, day: 5, hour: 10 });

function at(day: string, time = '12:00'): number {
  const [d, m, y] = day.split('.').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return dateTimeToTick({ year: y, month: m, day: d, hour, minute });
}

describe('account-fee-logic', () => {
  describe('monthlyAccountFee', () => {
    // TS §7.4: account fee pro rata by calendar days, waiver by external deposits
    it.each<[string, FeeConditions, string, string | null, string | null, number, number]>([
      ['a full month', DIRECT, '04.2030', null, null, 0, 990],
      ['a full month just below the waiver', DIRECT, '04.2030', null, null, 69_999, 990],
      ['a full month at the waiver', DIRECT, '04.2030', null, null, 70_000, 0],
      ['the opening month', DIRECT, '04.2030', '15.04.2030', null, 0, 528],
      ['the opening month with the full waiver', DIRECT, '04.2030', '15.04.2030', null, 250_000, 0],
      ['the closing month', DIRECT, '05.2030', null, '10.05.2030', 50_000, 319],
      ['one day', DIRECT, '05.2030', '10.05.2030', '10.05.2030', 0, 32],
      ['a month before the opening', DIRECT, '06.2030', '01.07.2030', null, 0, 0],
      ['February 2031', DIRECT, '02.2031', null, null, 0, 990],
      ['a bank without waiver', BRANCH, '04.2030', null, null, 250_000, 1_200],
    ])('charges %s', (_case, conditions, monthText, opened, closed, deposits, fee) => {
      const [month, year] = monthText.split('.').map(Number);
      const account = {
        openedAt: opened === null ? EARLIER : at(opened, '09:00'),
        closedAt: closed === null ? null : at(closed, '18:00'),
      };
      expect(monthlyAccountFee(conditions, account, { year, month }, deposits)).toBe(fee);
    });

    it('charges a partial month at most the full fee, growing with the open days', () => {
      fc.assert(
        fc.property(
          arbCalendarMonth(),
          fc.integer({ min: 1, max: 31 }),
          fc.integer({ min: 1, max: 31 }),
          ({ year, month }, a, b) => {
            const days = daysInMonth(year, month);
            const [from, to] = [Math.min(a, b, days), Math.min(Math.max(a, b), days)];
            const fee = (lastDay: number): number =>
              monthlyAccountFee(
                BRANCH,
                {
                  openedAt: dateTimeToTick({ year, month, day: from }),
                  closedAt: dateTimeToTick({ year, month, day: lastDay }),
                },
                { year, month },
                0,
              );
            expect(fee(to)).toBeLessThanOrEqual(BRANCH.monthlyFee);
            expect(fee(to)).toBeGreaterThanOrEqual(fee(from));
            if (to < days) {
              expect(fee(to + 1)).toBeGreaterThanOrEqual(fee(to));
            }
          },
        ),
      );
    });
  });

  describe('openDaysInMonth', () => {
    it.each<[string | null, string | null, number]>([
      [null, null, 31],
      ['01.05.2030', null, 31],
      ['31.05.2030', null, 1],
      [null, '01.05.2030', 1],
      [null, '30.04.2030', 0],
      ['01.06.2030', null, 0],
      ['10.05.2030', '20.05.2030', 11],
    ])('counts the days of May 2030 from %s to %s', (opened, closed, days) => {
      const account = {
        openedAt: opened === null ? EARLIER : at(opened, '23:59'),
        closedAt: closed === null ? null : at(closed, '00:00'),
      };
      expect(openDaysInMonth(account, { year: 2030, month: 5 })).toBe(days);
    });
  });

  describe('closingAccountFees', () => {
    const account = { openedAt: EARLIER, closedAt: null };

    // TS §7.4: account closing before and after the first bank run of the month
    it.each<[string, string, number, number, { month: number; amount: number }[]]>([
      [
        '01.06.2030',
        '10:00',
        0,
        0,
        [
          { month: 5, amount: 990 },
          { month: 6, amount: 33 },
        ],
      ],
      [
        '03.06.2030',
        '05:59',
        0,
        0,
        [
          { month: 5, amount: 990 },
          { month: 6, amount: 99 },
        ],
      ],
      ['03.06.2030', '06:00', 0, 0, [{ month: 6, amount: 99 }]],
      ['03.06.2030', '05:59', 250_000, 0, [{ month: 6, amount: 99 }]],
      ['20.06.2030', '12:00', 0, 70_000, []],
    ])('charges a closing on %s %s', (day, time, lastMonth, thisMonth, charges) => {
      const result = closingAccountFees(DIRECT, account, at(day, time), {
        depositsLastMonth: lastMonth,
        depositsThisMonth: thisMonth,
      });
      expect(result).toEqual(
        charges.map(({ month, amount }) => ({ month: { year: 2030, month }, amount })),
      );
    });

    it('charges nothing for the previous month when the account opened this month', () => {
      const opened = { openedAt: at('01.06.2030', '01:00'), closedAt: null };
      expect(
        closingAccountFees(DIRECT, opened, at('02.06.2030'), {
          depositsLastMonth: 0,
          depositsThisMonth: 0,
        }),
      ).toEqual([{ month: { year: 2030, month: 6 }, amount: 66 }]);
    });

    it('charges December when the account closes before the first bank run of January', () => {
      expect(
        closingAccountFees(BRANCH, account, at('01.01.2031', '05:00'), {
          depositsLastMonth: 0,
          depositsThisMonth: 0,
        }),
      ).toEqual([
        { month: { year: 2030, month: 12 }, amount: 1_200 },
        { month: { year: 2031, month: 1 }, amount: 39 },
      ]);
    });
  });
});
