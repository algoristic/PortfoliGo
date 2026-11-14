import fc from 'fast-check';

import { monthKey } from '@app/banking/domain/calendar-month-logic';
import { dateTimeToTick, tickToDateTime, weekday } from '@app/clock/domain/calendar-logic';
import {
  MINUTES_PER_HOUR,
  SATURDAY,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  TICKS_PER_MINUTE,
  TradingHours,
} from '@app/clock/domain/models/time.model';

import { SavingsPlan } from './models/savings-plan.model';
import {
  nextSavingsPlanTick,
  savingsPlanDueMonth,
  savingsPlanExecutionTick,
  savingsPlanHandledBefore,
  savingsPlanNextExecution,
} from './savings-plan-schedule-logic';

import { arbCalendarMonth, arbTick, END_OF_CALENDAR_TICK } from '../../../testing/arbitraries';

const EUROPE: TradingHours = { open: 9 * MINUTES_PER_HOUR, close: 17 * MINUTES_PER_HOUR + 30 };
const AMERICA: TradingHours = {
  open: 15 * MINUTES_PER_HOUR + 30,
  close: 22 * MINUTES_PER_HOUR,
};
const ASIA: TradingHours = { open: MINUTES_PER_HOUR, close: 7 * MINUTES_PER_HOUR };

function at(day: string, time = '00:00'): number {
  const [d, m, y] = day.split('.').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return dateTimeToTick({ year: y, month: m, day: d, hour, minute });
}

function plan(
  day: number,
  handledUpTo: string,
  paused = false,
): Pick<SavingsPlan, 'day' | 'paused' | 'handledUpTo'> {
  return { day, handledUpTo, paused };
}

describe('savings-plan-schedule-logic', () => {
  describe('savingsPlanExecutionTick', () => {
    // TS §7.8: open of the exchange on the day or the next trading day
    it.each<[number, number, number, TradingHours, string, string]>([
      [15, 2030, 4, EUROPE, '15.04.2030', '09:00'],
      [6, 2030, 4, EUROPE, '08.04.2030', '09:00'],
      [15, 2030, 6, AMERICA, '17.06.2030', '15:30'],
      [28, 2030, 9, ASIA, '30.09.2030', '01:00'],
      [28, 2030, 12, EUROPE, '30.12.2030', '09:00'],
      [28, 2032, 2, EUROPE, '01.03.2032', '09:00'],
    ])('runs day %d of %d-%d at %s', (day, year, month, hours, date, time) => {
      expect(savingsPlanExecutionTick(day, { year, month }, hours)).toBe(at(date, time));
    });

    it('lies on a weekday at the open, at most two days after the day', () => {
      fc.assert(
        fc.property(arbCalendarMonth(), fc.integer({ min: 1, max: 28 }), (month, day) => {
          fc.pre(month.year < 2100 || month.month < 12);
          const tick = savingsPlanExecutionTick(day, month, EUROPE);
          const start = dateTimeToTick({ ...month, day });
          expect(weekday(tick)).toBeLessThan(SATURDAY);
          expect(tickToDateTime(tick)).toMatchObject({ hour: 9, minute: 0 });
          expect(tick - start).toBeGreaterThanOrEqual(9 * TICKS_PER_HOUR);
          expect(tick - start).toBeLessThan(3 * TICKS_PER_DAY);
        }),
      );
    });
  });

  describe('savingsPlanHandledBefore', () => {
    // TS §7.8: a command after tick T is done up to the newest month whose date lies before T + 1
    it.each<[number, string, string, string, string, string]>([
      [15, '15.04.2030', '08:59', '2030-03', '15.04.2030', '09:00'],
      [15, '15.04.2030', '09:00', '2030-04', '15.05.2030', '09:00'],
      [28, '29.02.2032', '12:00', '2032-01', '01.03.2032', '09:00'],
      [28, '01.03.2032', '10:00', '2032-02', '29.03.2032', '09:00'],
    ])(
      'handles day %d after %s %s up to %s, first execution %s %s',
      (day, date, time, handled, firstDate, firstTime) => {
        const from = at(date, time) + TICKS_PER_MINUTE;
        expect(savingsPlanHandledBefore(day, EUROPE, from)).toBe(handled);
        expect(savingsPlanNextExecution(plan(day, handled), EUROPE, from)).toBe(
          at(firstDate, firstTime),
        );
      },
    );

    it('makes the first execution the first one at or after the command', () => {
      fc.assert(
        fc.property(
          arbTick().filter((tick) => tick < END_OF_CALENDAR_TICK - 40 * TICKS_PER_DAY),
          fc.integer({ min: 1, max: 28 }),
          (from, day) => {
            const handled = savingsPlanHandledBefore(day, ASIA, from);
            const next = savingsPlanNextExecution(plan(day, handled), ASIA, from) as number;
            expect(next).toBeGreaterThanOrEqual(from);
            expect(next - from).toBeLessThan(35 * TICKS_PER_DAY);
            // The month before the first execution's is done, the one of it is not.
            const due = savingsPlanDueMonth(plan(day, handled), ASIA, next);
            expect(due).not.toBeNull();
            expect(monthKey(due ?? { year: 0, month: 1 }) > handled).toBe(true);
          },
        ),
      );
    });
  });

  describe('savingsPlanDueMonth', () => {
    it.each<[string, Pick<SavingsPlan, 'day' | 'paused' | 'handledUpTo'>, string, string | null]>([
      ['the execution of April', plan(15, '2030-03'), '15.04.2030 09:00', '2030-04'],
      ['a minute later', plan(15, '2030-03'), '15.04.2030 09:01', null],
      ['a done month', plan(15, '2030-04'), '15.04.2030 09:00', null],
      ['a paused plan', plan(15, '2030-03', true), '15.04.2030 09:00', null],
      [
        'a weekend day moved into the next month',
        plan(28, '2032-01'),
        '01.03.2032 09:00',
        '2032-02',
      ],
      ['the next month on the same day', plan(1, '2032-02'), '01.03.2032 09:00', '2032-03'],
    ])('finds %s', (_name, savingsPlan, when, expected) => {
      const [date, time] = when.split(' ');
      const month = savingsPlanDueMonth(savingsPlan, EUROPE, at(date, time));
      expect(month === null ? null : monthKey(month)).toBe(expected);
    });

    it('agrees with the next execution', () => {
      fc.assert(
        fc.property(
          arbTick().filter((tick) => tick < END_OF_CALENDAR_TICK - 40 * TICKS_PER_DAY),
          fc.integer({ min: 1, max: 28 }),
          (from, day) => {
            const savingsPlan = plan(day, savingsPlanHandledBefore(day, AMERICA, from));
            const next = savingsPlanNextExecution(savingsPlan, AMERICA, from) as number;
            expect(savingsPlanDueMonth(savingsPlan, AMERICA, next)).not.toBeNull();
            expect(savingsPlanDueMonth(savingsPlan, AMERICA, next - TICKS_PER_MINUTE)).toBeNull();
          },
        ),
      );
    });
  });

  describe('savingsPlanNextExecution', () => {
    it('is null for a paused plan', () => {
      expect(savingsPlanNextExecution(plan(15, '2030-03', true), EUROPE, at('01.04.2030'))).toBe(
        null,
      );
    });

    it('skips done months', () => {
      expect(savingsPlanNextExecution(plan(15, '2030-05'), EUROPE, at('01.04.2030'))).toBe(
        at('17.06.2030', '09:00'),
      );
    });
  });

  describe('nextSavingsPlanTick', () => {
    it('takes the earliest execution of the active plans', () => {
      const base = { depotId: 'dep-2', instrumentId: 'x', amount: 100, createdAt: 0 } as const;
      const plans: SavingsPlan[] = [
        { ...base, ...plan(15, '2030-03'), id: 'sp-1' },
        { ...base, ...plan(10, '2030-03'), id: 'sp-2' },
        { ...base, ...plan(5, '2030-03', true), id: 'sp-3' },
      ];
      const hours = (p: SavingsPlan): TradingHours => (p.id === 'sp-1' ? ASIA : AMERICA);
      expect(nextSavingsPlanTick(plans, hours, at('01.04.2030'))).toBe(at('10.04.2030', '15:30'));
      expect(nextSavingsPlanTick(plans.slice(2), hours, at('01.04.2030'))).toBeNull();
    });
  });
});
