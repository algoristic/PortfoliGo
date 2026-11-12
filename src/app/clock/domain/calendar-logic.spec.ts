import fc from 'fast-check';

import {
  dateTimeToTick,
  dayIndex,
  daysInMonth,
  firstBankWorkingDay,
  GAME_START_TICK,
  isBankWorkingDay,
  isLeapYear,
  isWeekend,
  lastBankWorkingDay,
  minuteOfDay,
  startOfDay,
  startOfMonth,
  startOfNextMonth,
  startOfNextYear,
  startOfYear,
  tickToDateTime,
  weekday,
} from './calendar-logic';
import { TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_MINUTE } from './models/time.model';

import { arbTick } from '../../../testing/arbitraries';

const EPOCH_MS = Date.UTC(2020, 0, 1);

/** Independent oracle: the UTC calendar of `Date` (TS §3.1). */
function utcDate(tick: number): Date {
  return new Date(EPOCH_MS + (tick / TICKS_PER_MINUTE) * 60_000);
}

describe('calendar-logic', () => {
  describe('GAME_START_TICK', () => {
    it('is Monday, 01.04.2030, 00:00 at tick 5.389.920', () => {
      expect(GAME_START_TICK).toBe(5_389_920);
      expect(tickToDateTime(GAME_START_TICK)).toEqual({
        year: 2030,
        month: 4,
        day: 1,
        hour: 0,
        minute: 0,
      });
      expect(weekday(GAME_START_TICK)).toBe(0);
    });
  });

  describe('tickToDateTime', () => {
    it('returns the epoch 01.01.2020, 00:00 for tick 0', () => {
      expect(tickToDateTime(0)).toEqual({ year: 2020, month: 1, day: 1, hour: 0, minute: 0 });
    });

    it('returns hour and minute within the day', () => {
      expect(tickToDateTime(GAME_START_TICK + 9 * TICKS_PER_HOUR + 30)).toEqual({
        year: 2030,
        month: 4,
        day: 1,
        hour: 9,
        minute: 30,
      });
    });

    it('returns the last minute of a year before the year change', () => {
      const newYear = dateTimeToTick({ year: 2031, month: 1, day: 1 });
      expect(tickToDateTime(newYear - 1)).toEqual({
        year: 2030,
        month: 12,
        day: 31,
        hour: 23,
        minute: 59,
      });
    });

    it('round-trips with dateTimeToTick for every day from 2020 to 2100', () => {
      const end = dateTimeToTick({ year: 2101, month: 1, day: 1 });
      for (let tick = 0; tick < end; tick += TICKS_PER_DAY + 7) {
        expect(dateTimeToTick(tickToDateTime(tick))).toBe(tick);
      }
    });

    it('matches the UTC calendar of Date for every day from 2020 to 2100', () => {
      const end = dateTimeToTick({ year: 2101, month: 1, day: 1 });
      for (let tick = 0; tick < end; tick += TICKS_PER_DAY) {
        const date = utcDate(tick);
        expect(tickToDateTime(tick)).toEqual({
          year: date.getUTCFullYear(),
          month: date.getUTCMonth() + 1,
          day: date.getUTCDate(),
          hour: 0,
          minute: 0,
        });
        expect(weekday(tick)).toBe((date.getUTCDay() + 6) % 7);
      }
    });

    it('matches the UTC calendar of Date and round-trips at any minute', () => {
      fc.assert(
        fc.property(arbTick(), (tick) => {
          const date = utcDate(tick);
          const dateTime = tickToDateTime(tick);
          expect(dateTime).toEqual({
            year: date.getUTCFullYear(),
            month: date.getUTCMonth() + 1,
            day: date.getUTCDate(),
            hour: date.getUTCHours(),
            minute: date.getUTCMinutes(),
          });
          expect(dateTimeToTick(dateTime)).toBe(tick);
          expect(isWeekend(tick)).toBe(date.getUTCDay() === 0 || date.getUTCDay() === 6);
        }),
      );
    });
  });

  describe('dateTimeToTick', () => {
    it('counts 29.02. in leap years', () => {
      expect(
        dateTimeToTick({ year: 2024, month: 3, day: 1 }) -
          dateTimeToTick({ year: 2024, month: 2, day: 28 }),
      ).toBe(2 * TICKS_PER_DAY);
    });

    it('skips 29.02. in 2100', () => {
      expect(
        dateTimeToTick({ year: 2100, month: 3, day: 1 }) -
          dateTimeToTick({ year: 2100, month: 2, day: 28 }),
      ).toBe(TICKS_PER_DAY);
    });

    // Valid input: integer year, month 1–12, day 1–length of the month, hour 0–23, minute 0–59.
    it.each([
      ['a fractional year', { year: 2030.5, month: 1, day: 1 }],
      ['a fractional month', { year: 2030, month: 1.5, day: 1 }],
      ['month 0', { year: 2030, month: 0, day: 1 }],
      ['day 0', { year: 2030, month: 1, day: 0 }],
      ['a fractional day', { year: 2030, month: 1, day: 1.5 }],
      ['hour −1', { year: 2030, month: 1, day: 1, hour: -1 }],
      ['a fractional hour', { year: 2030, month: 1, day: 1, hour: 1.5 }],
      ['minute −1', { year: 2030, month: 1, day: 1, minute: -1 }],
      ['a fractional minute', { year: 2030, month: 1, day: 1, minute: 0.5 }],
    ])('throws for %s', (_case, dateTime) => {
      expect(() => dateTimeToTick(dateTime)).toThrow(RangeError);
    });

    it('accepts the first and last minute of a month', () => {
      expect(() =>
        dateTimeToTick({ year: 2030, month: 1, day: 1, hour: 0, minute: 0 }),
      ).not.toThrow();
      expect(() =>
        dateTimeToTick({ year: 2030, month: 12, day: 31, hour: 23, minute: 59 }),
      ).not.toThrow();
    });

    it('throws for dates that do not exist', () => {
      expect(() => dateTimeToTick({ year: 2030, month: 2, day: 29 })).toThrow(RangeError);
      expect(() => dateTimeToTick({ year: 2030, month: 4, day: 31 })).toThrow(RangeError);
      expect(() => dateTimeToTick({ year: 2030, month: 13, day: 1 })).toThrow(RangeError);
      expect(() => dateTimeToTick({ year: 2030, month: 1, day: 1, hour: 24 })).toThrow(RangeError);
      expect(() => dateTimeToTick({ year: 2030, month: 1, day: 1, minute: 60 })).toThrow(
        RangeError,
      );
    });
  });

  describe('dayIndex, startOfDay and minuteOfDay', () => {
    it('split a tick into day and minute of day', () => {
      const tick = GAME_START_TICK + 17 * TICKS_PER_HOUR + 29;
      expect(dayIndex(tick)).toBe(3743);
      expect(startOfDay(tick)).toBe(GAME_START_TICK);
      expect(minuteOfDay(tick)).toBe(17 * 60 + 29);
    });

    it('recombine to the tick at any minute', () => {
      fc.assert(
        fc.property(arbTick(), (tick) => {
          expect(startOfDay(tick) + minuteOfDay(tick)).toBe(tick);
          expect(startOfDay(tick)).toBe(dayIndex(tick) * TICKS_PER_DAY);
          expect(minuteOfDay(tick)).toBeGreaterThanOrEqual(0);
          expect(minuteOfDay(tick)).toBeLessThan(TICKS_PER_DAY);
        }),
      );
    });
  });

  describe('weekday and isWeekend', () => {
    it('returns Wednesday for the epoch', () => {
      expect(weekday(0)).toBe(2);
    });

    it('detects Saturday and Sunday as weekend', () => {
      const saturday = dateTimeToTick({ year: 2030, month: 4, day: 6, hour: 12 });
      expect(weekday(saturday)).toBe(5);
      expect(isWeekend(saturday)).toBe(true);
      expect(isWeekend(saturday + TICKS_PER_DAY)).toBe(true);
      expect(isWeekend(saturday + 2 * TICKS_PER_DAY)).toBe(false);
      expect(isWeekend(saturday - TICKS_PER_DAY)).toBe(false);
    });

    it('switches to the weekend at midnight between Friday and Saturday', () => {
      const saturday = dateTimeToTick({ year: 2030, month: 4, day: 6 });
      expect(isWeekend(saturday - 1)).toBe(false);
      expect(isWeekend(saturday)).toBe(true);
    });
  });

  describe('isLeapYear and daysInMonth', () => {
    it('applies the Gregorian rules', () => {
      expect(isLeapYear(2024)).toBe(true);
      expect(isLeapYear(2030)).toBe(false);
      expect(isLeapYear(2100)).toBe(false);
      expect(isLeapYear(2000)).toBe(true);
    });

    it('returns the length of every month', () => {
      expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => daysInMonth(2030, m))).toEqual([
        31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
      ]);
      expect(daysInMonth(2032, 2)).toBe(29);
    });
  });

  describe('month and year boundaries', () => {
    const lastMinuteOfFebruary = dateTimeToTick({
      year: 2032,
      month: 2,
      day: 29,
      hour: 23,
      minute: 59,
    });

    it('returns the start of the month and of the next month', () => {
      expect(startOfMonth(lastMinuteOfFebruary)).toBe(
        dateTimeToTick({ year: 2032, month: 2, day: 1 }),
      );
      expect(startOfNextMonth(lastMinuteOfFebruary)).toBe(lastMinuteOfFebruary + 1);
    });

    it('rolls December over into January of the next year', () => {
      const december = dateTimeToTick({ year: 2030, month: 12, day: 15 });
      expect(startOfNextMonth(december)).toBe(dateTimeToTick({ year: 2031, month: 1, day: 1 }));
    });

    it('returns the start of the year and of the next year', () => {
      expect(startOfYear(lastMinuteOfFebruary)).toBe(
        dateTimeToTick({ year: 2032, month: 1, day: 1 }),
      );
      expect(startOfNextYear(lastMinuteOfFebruary)).toBe(
        dateTimeToTick({ year: 2033, month: 1, day: 1 }),
      );
    });

    it('keeps a month start unchanged', () => {
      expect(startOfMonth(GAME_START_TICK)).toBe(GAME_START_TICK);
    });

    it('enclose any minute in its month and year', () => {
      fc.assert(
        fc.property(arbTick(), (tick) => {
          const { year, month } = tickToDateTime(tick);
          const monthStart = dateTimeToTick({ year, month, day: 1 });
          expect(startOfMonth(tick)).toBe(monthStart);
          expect(startOfNextMonth(tick)).toBe(
            monthStart + daysInMonth(year, month) * TICKS_PER_DAY,
          );
          expect(startOfYear(tick)).toBe(dateTimeToTick({ year, month: 1, day: 1 }));
          expect(startOfNextYear(tick)).toBe(dateTimeToTick({ year: year + 1, month: 1, day: 1 }));
          expect(startOfMonth(tick) <= tick && tick < startOfNextMonth(tick)).toBe(true);
        }),
      );
    });
  });

  describe('bank working days', () => {
    // Bank working days are Monday to Friday; public holidays follow in stage 2 (TS §3.1).
    it('treats Monday to Friday as bank working days', () => {
      expect(isBankWorkingDay(GAME_START_TICK)).toBe(true);
      expect(isBankWorkingDay(dateTimeToTick({ year: 2030, month: 4, day: 6 }))).toBe(false);
    });

    it.each([
      // 01.04.2030 is a Monday, 01.06.2030 a Saturday.
      [2030, 4, 1],
      [2030, 6, 3],
    ])('starts %i-%i on day %i', (year, month, day) => {
      expect(firstBankWorkingDay(year, month)).toBe(dateTimeToTick({ year, month, day }));
    });

    it.each([
      // 30.04.2030 is a Tuesday, 31.08.2030 a Saturday, 29.02.2032 a Sunday.
      [2030, 4, 30],
      [2030, 8, 30],
      [2032, 2, 27],
    ])('ends %i-%i on day %i', (year, month, day) => {
      expect(lastBankWorkingDay(year, month)).toBe(dateTimeToTick({ year, month, day }));
    });

    it('finds the first and last weekday of any month', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2020, max: 2100 }),
          fc.integer({ min: 1, max: 12 }),
          (year, month) => {
            const weekdays = Array.from({ length: daysInMonth(year, month) }, (_, i) =>
              dateTimeToTick({ year, month, day: i + 1 }),
            ).filter((tick) => {
              const utcDay = utcDate(tick).getUTCDay();
              return utcDay !== 0 && utcDay !== 6;
            });
            expect(firstBankWorkingDay(year, month)).toBe(weekdays[0]);
            expect(lastBankWorkingDay(year, month)).toBe(weekdays[weekdays.length - 1]);
          },
        ),
      );
    });
  });
});
