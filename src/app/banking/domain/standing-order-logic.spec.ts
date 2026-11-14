import fc from 'fast-check';

import {
  dateTimeToTick,
  isBankWorkingDay,
  startOfDay,
  tickToDateTime,
} from '@app/clock/domain/calendar-logic';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '@app/clock/domain/models/time.model';

import { bankRunPlan, nextBankRunTick } from './bank-run-logic';
import { Account } from './models/account.model';
import { StandingOrderSpec } from './models/standing-order.model';
import {
  canExecute,
  dueMonth,
  executionDay,
  handledBefore,
  laterMonth,
  nextExecution,
  standingOrderError,
  standingOrderId,
  standingOrderSequence,
} from './standing-order-logic';

import { arbCalendarMonth, arbTick, END_OF_CALENDAR_TICK } from '../../../testing/arbitraries';

function at(day: string, time = '00:00'): number {
  const [d, m, y] = day.split('.').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return dateTimeToTick({ year: y, month: m, day: d, hour, minute });
}

function account(id: Account['id'], closedAt: number | null = null): Account {
  return {
    id,
    kind: 'current',
    bankId: 'b1',
    number: id.slice(4).padStart(10, '0'),
    openedAt: 0,
    closedAt,
  };
}

const ACCOUNTS: Account[] = [account('acc-1'), account('acc-2'), account('acc-3', 5)];
const SPEC: StandingOrderSpec = {
  fromAccountId: 'acc-1',
  toAccountId: 'acc-2',
  amount: 50_000,
  day: 15,
  purpose: 'Sparplan',
};

describe('standing-order-logic', () => {
  describe('standingOrderId', () => {
    it('numbers standing orders and reads the number back', () => {
      expect(standingOrderId(1)).toBe('so-1');
      expect(standingOrderSequence('so-12')).toBe(12);
      expect(() => standingOrderId(0)).toThrow(RangeError);
    });
  });

  describe('standingOrderError', () => {
    // TS §7.4, US-BK-10
    it.each<[string, Partial<StandingOrderSpec>, string | null]>([
      ['a valid order', {}, null],
      ['day 1', { day: 1 }, null],
      ['day 28', { day: 28 }, null],
      ['a purpose of 140 characters', { purpose: 'x'.repeat(140) }, null],
      ['an empty purpose', { purpose: '' }, null],
      ['an unknown source', { fromAccountId: 'acc-9' }, 'unknown-account'],
      ['a closed target', { toAccountId: 'acc-3' }, 'account-closed'],
      ['the same account', { toAccountId: 'acc-1' }, 'same-account'],
      ['0 cents', { amount: 0 }, 'invalid-amount'],
      ['a fraction of a cent', { amount: 1.5 }, 'invalid-amount'],
      ['day 0', { day: 0 }, 'invalid-day'],
      ['day 29', { day: 29 }, 'invalid-day'],
      ['day 1.5', { day: 1.5 }, 'invalid-day'],
      ['a purpose of 141 characters', { purpose: 'x'.repeat(141) }, 'purpose-too-long'],
      // more than the balance is fine: funds count on the execution day
      ['an amount of 1 Mio. €', { amount: 100_000_000 }, null],
    ])('checks %s', (_case, change, expected) => {
      expect(standingOrderError(ACCOUNTS, { ...SPEC, ...change })).toBe(expected);
    });
  });

  describe('executionDay', () => {
    // TS §7.4: execution days, weekends move to the next bank working day
    it.each([
      [15, 2030, 4, '15.04.2030'],
      [13, 2030, 4, '15.04.2030'],
      [28, 2030, 4, '29.04.2030'],
      [1, 2030, 5, '01.05.2030'],
      [1, 2030, 6, '03.06.2030'],
      [28, 2030, 6, '28.06.2030'],
      [28, 2030, 9, '30.09.2030'],
      [28, 2030, 12, '30.12.2030'],
      [28, 2032, 2, '01.03.2032'],
    ])('executes day %d of %d-%d on %s', (day, year, month, expected) => {
      expect(executionDay(day, { year, month })).toBe(at(expected));
    });

    it('is the first bank working day on or after the day', () => {
      fc.assert(
        fc.property(arbCalendarMonth(), fc.integer({ min: 1, max: 28 }), (month, day) => {
          const nominal = dateTimeToTick({ ...month, day });
          const execution = executionDay(day, month);
          expect(isBankWorkingDay(execution)).toBe(true);
          expect(execution).toBeGreaterThanOrEqual(nominal);
          for (let tick = nominal; tick < execution; tick += TICKS_PER_DAY) {
            expect(isBankWorkingDay(tick)).toBe(false);
          }
        }),
      );
    });
  });

  describe('handledBefore', () => {
    // TS §7.4: the first execution is the first execution day on or after the creation day
    it.each([
      [15, '10.04.2030', '2030-03'],
      [15, '15.04.2030', '2030-03'],
      [15, '16.04.2030', '2030-04'],
      [13, '14.04.2030', '2030-04'],
      [1, '15.01.2031', '2031-01'],
      [28, '01.01.2031', '2030-12'],
    ])('day %d created on %s is done up to %s', (day, created, expected) => {
      expect(handledBefore(day, at(created, '12:00'))).toBe(expected);
    });

    it('takes the later month', () => {
      expect(laterMonth('2030-04', '2030-12')).toBe('2030-12');
      expect(laterMonth('2031-01', '2030-12')).toBe('2031-01');
    });
  });

  describe('nextExecution', () => {
    // TS §7.4: next execution (bank run 06:00) of a standing order created at the given time
    it.each([
      [1, '01.04.2030', '05:00', '01.04.2030'],
      [1, '01.04.2030', '07:00', '01.05.2030'],
      [13, '10.04.2030', '12:00', '15.04.2030'],
      [13, '14.04.2030', '12:00', '13.05.2030'],
      [28, '27.02.2032', '12:00', '01.03.2032'],
      [28, '01.03.2032', '05:00', '29.03.2032'],
      [28, '14.12.2030', '12:00', '30.12.2030'],
    ])('day %d created on %s %s executes on %s', (day, created, time, expected) => {
      const createdAt = at(created, time);
      const order = { day, paused: false, handledUpTo: handledBefore(day, createdAt) };
      expect(nextExecution(order, createdAt + 1)).toBe(at(expected, '06:00'));
    });

    it('skips the months that are done', () => {
      const order = { day: 13, paused: false, handledUpTo: '2030-04' };
      expect(nextExecution(order, at('15.04.2030', '06:01'))).toBe(at('13.05.2030', '06:00'));
      expect(nextExecution(order, at('15.04.2030', '05:00'))).toBe(at('13.05.2030', '06:00'));
    });

    it('includes a run at exactly the given tick', () => {
      const order = { day: 15, paused: false, handledUpTo: '2030-03' };
      expect(nextExecution(order, at('15.04.2030', '06:00'))).toBe(at('15.04.2030', '06:00'));
      expect(nextExecution(order, at('15.04.2030', '06:01'))).toBe(at('15.05.2030', '06:00'));
    });

    it('is null for a paused order', () => {
      expect(nextExecution({ day: 1, paused: true, handledUpTo: '2030-03' }, 0)).toBeNull();
    });
  });

  describe('dueMonth', () => {
    it.each([
      [28, '2032-01', '01.03.2032', { year: 2032, month: 2 }],
      [28, '2032-02', '01.03.2032', null],
      [13, '2030-03', '15.04.2030', { year: 2030, month: 4 }],
      [13, '2030-03', '13.04.2030', null],
      [13, '2030-03', '16.04.2030', null],
    ])('day %d done up to %s on %s → %o', (day, handledUpTo, today, expected) => {
      expect(dueMonth({ day, paused: false, handledUpTo }, at(today, '06:00'))).toEqual(expected);
      expect(dueMonth({ day, paused: true, handledUpTo }, at(today, '06:00'))).toBeNull();
    });

    it('falls on the day of the next execution and on no day before', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: END_OF_CALENDAR_TICK - 70 * TICKS_PER_DAY }),
          fc.integer({ min: 1, max: 28 }),
          (from, day) => {
            const order = { day, paused: false, handledUpTo: handledBefore(day, from) };
            const next = nextExecution(order, from) as number;
            expect(next).toBeGreaterThanOrEqual(from);
            expect(next - startOfDay(next)).toBe(6 * TICKS_PER_HOUR);
            const due = dueMonth(order, next);
            expect(due).not.toBeNull();
            // Days whose bank run (06:00) lies at or after `from`.
            const first =
              from - startOfDay(from) > 6 * TICKS_PER_HOUR
                ? startOfDay(from) + TICKS_PER_DAY
                : startOfDay(from);
            for (let tick = first; tick < startOfDay(next); tick += TICKS_PER_DAY) {
              expect(dueMonth(order, tick)).toBeNull();
            }
          },
        ),
        { numRuns: 50 },
      );
    });

    it('executes once per month when nothing is skipped', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2021, max: 2099 }),
          fc.integer({ min: 1, max: 28 }),
          (year, day) => {
            let handledUpTo = `${year - 1}-12`;
            let runs = 0;
            const start = dateTimeToTick({ year, month: 1, day: 1 });
            const end = dateTimeToTick({ year: year + 1, month: 1, day: 1 });
            for (let tick = start; tick < end; tick += TICKS_PER_DAY) {
              const due = dueMonth({ day, paused: false, handledUpTo }, tick);
              if (due !== null) {
                runs++;
                handledUpTo = `${due.year}-${String(due.month).padStart(2, '0')}`;
                expect(tickToDateTime(tick).month - due.month).toBeLessThanOrEqual(1);
              }
            }
            // December's day 28 may fall into January of the next year.
            expect(runs).toBeGreaterThanOrEqual(11);
            expect(runs).toBeLessThanOrEqual(12);
          },
        ),
        { numRuns: 25 },
      );
    });
  });

  describe('bank run with standing orders', () => {
    it('adds the standing orders as the last step on their execution day only', () => {
      const order = { day: 28, paused: false, handledUpTo: '2030-05' };
      expect(bankRunPlan(at('28.06.2030', '06:00'), [order]).steps).toEqual([
        'salary',
        'standing-orders',
      ]);
      expect(bankRunPlan(at('27.06.2030', '06:00'), [order]).steps).toEqual([]);
      expect(bankRunPlan(at('28.06.2030', '06:00'), [{ ...order, paused: true }]).steps).toEqual([
        'salary',
      ]);
    });

    it('runs the bank on days when only standing orders are due', () => {
      const order = { day: 13, paused: false, handledUpTo: '2030-03' };
      expect(nextBankRunTick(at('02.04.2030', '00:00'), [order])).toBe(at('15.04.2030', '06:00'));
      expect(nextBankRunTick(at('02.04.2030', '00:00'))).toBe(at('30.04.2030', '06:00'));
      expect(bankRunPlan(at('15.04.2030', '06:00'), [order]).steps).toEqual(['standing-orders']);
    });

    it('never runs later than the next execution of any standing order', () => {
      fc.assert(
        fc.property(arbTick(), fc.integer({ min: 1, max: 28 }), (tick, day) => {
          fc.pre(tick < END_OF_CALENDAR_TICK - 70 * TICKS_PER_DAY);
          const order = { day, paused: false, handledUpTo: handledBefore(day, tick) };
          expect(nextBankRunTick(tick, [order])).toBe(
            Math.min(nextBankRunTick(tick), nextExecution(order, tick) as number),
          );
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('canExecute', () => {
    // TS §7.4: no partial transfers
    it.each([
      [50_000, 50_000, true],
      [50_000, 49_999, false],
      [1, 0, false],
    ])('%d cents with %d available → %s', (amount, available, expected) => {
      expect(canExecute(amount, available)).toBe(expected);
    });
  });
});
