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
import { TICKS_PER_DAY, TICKS_PER_HOUR } from './models/time.model';

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
      const epochMs = Date.UTC(2020, 0, 1);
      const end = dateTimeToTick({ year: 2101, month: 1, day: 1 });
      for (let tick = 0; tick < end; tick += TICKS_PER_DAY) {
        const date = new Date(epochMs + (tick / TICKS_PER_DAY) * 86_400_000);
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
  });

  describe('bank working days', () => {
    it('treats Monday to Friday as bank working days', () => {
      expect(isBankWorkingDay(GAME_START_TICK)).toBe(true);
      expect(isBankWorkingDay(dateTimeToTick({ year: 2030, month: 4, day: 6 }))).toBe(false);
    });

    it('returns the first day of a month starting on a weekday', () => {
      expect(firstBankWorkingDay(2030, 4)).toBe(GAME_START_TICK);
    });

    it('skips a weekend at the start of the month', () => {
      // 01.06.2030 is a Saturday.
      expect(firstBankWorkingDay(2030, 6)).toBe(dateTimeToTick({ year: 2030, month: 6, day: 3 }));
    });

    it('returns the last day of a month ending on a weekday', () => {
      // 30.04.2030 is a Tuesday.
      expect(lastBankWorkingDay(2030, 4)).toBe(dateTimeToTick({ year: 2030, month: 4, day: 30 }));
    });

    it('skips a weekend at the end of the month', () => {
      // 31.08.2030 is a Saturday.
      expect(lastBankWorkingDay(2030, 8)).toBe(dateTimeToTick({ year: 2030, month: 8, day: 30 }));
    });

    it('handles February in a leap year', () => {
      // 29.02.2032 is a Sunday.
      expect(lastBankWorkingDay(2032, 2)).toBe(dateTimeToTick({ year: 2032, month: 2, day: 27 }));
    });
  });
});
