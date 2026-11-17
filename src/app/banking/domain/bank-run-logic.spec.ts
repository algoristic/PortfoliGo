import fc from 'fast-check';

import { dateTimeToTick, daysInMonth, isBankWorkingDay } from '@app/clock/domain/calendar-logic';
import { TICKS_PER_DAY } from '@app/clock/domain/models/time.model';

import {
  bankRunPlan,
  isInterestPayoutDue,
  monthKey,
  monthOf,
  nextBankRunTick,
  openInterestPeriod,
  previousMonth,
  startsQuarter,
} from './bank-run-logic';
import { BankRunStep } from './models/household.model';

import { arbCalendarMonth, arbTick } from '../../../testing/arbitraries';

const FIRST_DAY: BankRunStep[] = [
  'overdraft-limits',
  'credit-interest',
  'living-costs',
  'account-fee',
  'overdraft-interest',
  'debit-interest',
];

/** First bank working day of January, April, July and October: also the custody fee (AP 5.2). */
const FIRST_OF_QUARTER: BankRunStep[] = [
  'overdraft-limits',
  'credit-interest',
  'living-costs',
  'account-fee',
  'custody-fee',
  'overdraft-interest',
  'debit-interest',
];

function at(day: string, time = '06:00'): number {
  const [d, m, y] = day.split('.').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return dateTimeToTick({ year: y, month: m, day: d, hour, minute });
}

describe('bank-run-logic', () => {
  describe('bankRunPlan', () => {
    // TS §7.4: bank run dates, first and last bank working days around weekends
    it.each<[string, BankRunStep[], boolean]>([
      ['01.04.2030', FIRST_OF_QUARTER, true],
      ['30.04.2030', ['salary'], false],
      ['15.05.2030', [], false],
      ['31.05.2030', ['salary'], false],
      ['01.06.2030', [], false],
      ['02.06.2030', [], false],
      ['03.06.2030', FIRST_DAY, false],
      ['28.06.2030', ['salary'], false],
      ['29.06.2030', [], false],
      ['30.06.2030', [], false],
      ['30.08.2030', ['salary'], false],
      ['31.08.2030', [], false],
      ['01.10.2030', FIRST_OF_QUARTER, true],
      ['01.01.2031', FIRST_OF_QUARTER, true],
      ['01.02.2031', [], false],
      ['03.02.2031', FIRST_DAY, false],
    ])('plans the run of %s', (day, steps, quarterly) => {
      const plan = bankRunPlan(at(day));
      expect(plan.steps).toEqual(steps);
      expect(plan.quarterlyPayout).toBe(quarterly);
    });

    it('names the month and the settled month', () => {
      const plan = bankRunPlan(at('01.01.2031'));
      expect(plan.month).toEqual({ year: 2031, month: 1 });
      expect(plan.settledMonth).toEqual({ year: 2030, month: 12 });
    });

    it('depends only on the day', () => {
      fc.assert(
        fc.property(arbTick(), (tick) => {
          const dayStart = tick - (tick % TICKS_PER_DAY);
          expect(bankRunPlan(tick)).toEqual(bankRunPlan(dayStart));
        }),
      );
    });

    it('plans every month exactly one salary and one first-day run on bank working days', () => {
      fc.assert(
        fc.property(arbCalendarMonth(), ({ year, month }) => {
          const start = dateTimeToTick({ year, month, day: 1 });
          const days = daysInMonth(year, month);
          const runs: { day: number; steps: BankRunStep[] }[] = [];
          for (let day = 0; day < days; day++) {
            const { steps } = bankRunPlan(start + day * TICKS_PER_DAY);
            if (steps.length > 0) {
              expect(isBankWorkingDay(start + day * TICKS_PER_DAY)).toBe(true);
              runs.push({ day, steps });
            }
          }
          expect(runs.map(({ steps }) => steps)).toEqual([
            (month - 1) % 3 === 0 ? FIRST_OF_QUARTER : FIRST_DAY,
            ['salary'],
          ]);
          expect(runs[0].day).toBeLessThanOrEqual(2);
          expect(runs[1].day).toBeGreaterThanOrEqual(days - 3);
        }),
      );
    });
  });

  describe('nextBankRunTick', () => {
    // TS §7.4: next bank run
    it.each([
      ['15.05.2030', '10:00', '31.05.2030'],
      ['01.04.2030', '06:00', '01.04.2030'],
      ['01.04.2030', '00:00', '01.04.2030'],
      ['01.04.2030', '06:01', '30.04.2030'],
      ['31.05.2030', '07:00', '03.06.2030'],
    ])('finds the run after %s %s on %s', (day, time, next) => {
      expect(nextBankRunTick(at(day, time))).toBe(at(next));
    });

    it('returns a run with steps at or after the tick and none in between', () => {
      fc.assert(
        fc.property(arbTick(), (tick) => {
          const next = nextBankRunTick(tick);
          expect(next).toBeGreaterThanOrEqual(tick);
          expect(bankRunPlan(next).steps.length).toBeGreaterThan(0);
          for (let run = next - TICKS_PER_DAY; run >= tick; run -= TICKS_PER_DAY) {
            expect(bankRunPlan(run).steps).toEqual([]);
          }
        }),
      );
    });
  });

  describe('openInterestPeriod', () => {
    // TS §7.4, Kontoabschluss (AP 7.3b): open interest period of a closing account
    it.each<[string, 'monthly' | 'quarterly', string, string, string, string]>([
      [
        'after the run of May',
        'monthly',
        '01.04.2030',
        'Di 14.05.2030 10:00',
        '2030-05',
        '2030-05',
      ],
      [
        'before the run of May',
        'monthly',
        '01.04.2030',
        'Mi 01.05.2030 05:59',
        '2030-04',
        '2030-04',
      ],
      ['at the run of May', 'monthly', '01.04.2030', 'Mi 01.05.2030 06:00', '2030-05', '2030-04'],
      [
        'on Saturday before the run of June',
        'monthly',
        '01.04.2030',
        'Sa 01.06.2030 10:00',
        '2030-05',
        '2030-05',
      ],
      [
        'in the middle of the quarter',
        'quarterly',
        '01.04.2030',
        'Mi 15.05.2030 12:00',
        '2030-04',
        '2030-05',
      ],
      [
        'before the run of July',
        'quarterly',
        '01.04.2030',
        'Mo 01.07.2030 05:00',
        '2030-04',
        '2030-06',
      ],
      [
        'after the run of July',
        'quarterly',
        '01.04.2030',
        'Mo 01.07.2030 10:00',
        '2030-07',
        '2030-06',
      ],
      [
        'opened in the quarter',
        'quarterly',
        '10.05.2030',
        'Do 20.06.2030 10:00',
        '2030-05',
        '2030-06',
      ],
      ['in February', 'quarterly', '01.04.2030', 'Fr 14.02.2031 10:00', '2031-01', '2031-02'],
      [
        'before the run of January',
        'quarterly',
        '01.04.2030',
        'Mi 01.01.2031 05:00',
        '2030-10',
        '2030-12',
      ],
    ])('%s (%s)', (_case, payout, opened, closing, from, to) => {
      const [, day, time] = closing.split(' ');
      const period = openInterestPeriod(payout, at(opened, '00:00'), at(day, time));
      expect([monthKey(period.from), monthKey(period.to)]).toEqual([from, to]);
    });
  });

  describe('isInterestPayoutDue', () => {
    it.each([
      [1, true],
      [2, false],
      [3, false],
      [4, true],
      [5, false],
      [6, false],
      [7, true],
      [9, false],
      [10, true],
      [12, false],
    ])('pays quarterly interest in month %d: %s', (month, due) => {
      expect(isInterestPayoutDue('quarterly', { year: 2030, month })).toBe(due);
      expect(isInterestPayoutDue('monthly', { year: 2030, month })).toBe(true);
      expect(startsQuarter({ year: 2030, month })).toBe(due);
    });
  });

  describe('months', () => {
    it.each([
      [{ year: 2030, month: 4 }, '2030-04', { year: 2030, month: 3 }],
      [{ year: 2031, month: 1 }, '2031-01', { year: 2030, month: 12 }],
      [{ year: 2030, month: 12 }, '2030-12', { year: 2030, month: 11 }],
    ])('keys %o as %s', (month, key, previous) => {
      expect(monthKey(month)).toBe(key);
      expect(previousMonth(month)).toEqual(previous);
    });

    it('takes the month of a tick', () => {
      expect(monthOf(at('31.12.2030', '23:59'))).toEqual({ year: 2030, month: 12 });
    });
  });
});
