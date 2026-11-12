import {
  dateTimeToTick,
  dayIndex,
  dayStartTick,
  tickToDateTime,
  weekdayOfDay,
} from '@app/clock/domain/calendar-logic';

import {
  announcementDay,
  dividendCents,
  exDayOnOrAfter,
  exMarkdown,
  paymentDay,
} from './dividend-logic';

const MONDAY = 0;
const WEDNESDAY = 2;

function day(year: number, month: number, dayOfMonth: number): number {
  return dayIndex(dateTimeToTick({ year, month, day: dayOfMonth }));
}

describe('dividend logic', () => {
  describe('exDayOnOrAfter', () => {
    it('repeats the date every three months for quarterly payers', () => {
      const schedule = { firstMonth: 2, day: 10 };
      // 10.02.2021 is a Wednesday, 10.05.2021 a Monday.
      expect(exDayOnOrAfter(schedule, 'quarterly', day(2021, 1, 1))).toBe(day(2021, 2, 10));
      expect(exDayOnOrAfter(schedule, 'quarterly', day(2021, 2, 11))).toBe(day(2021, 5, 10));
      expect(exDayOnOrAfter(schedule, 'quarterly', day(2021, 11, 11))).toBe(day(2022, 2, 10));
    });

    it('moves a date on a weekend to the next Monday', () => {
      // 10.04.2021 is a Saturday.
      const exDay = exDayOnOrAfter({ firstMonth: 4, day: 10 }, 'annual', day(2021, 1, 1));
      expect(exDay).toBe(day(2021, 4, 12));
      expect(weekdayOfDay(exDay)).toBe(MONDAY);
    });

    it('keeps a weekend date of the previous year that moves into the new year', () => {
      // 28.12.2025 is a Sunday; the ex-date is Monday, 29.12.2025, so from 29.12. on it counts.
      expect(exDayOnOrAfter({ firstMonth: 12, day: 28 }, 'annual', day(2025, 12, 29))).toBe(
        day(2025, 12, 29),
      );
    });

    it('uses half-yearly steps for semi-annual payers', () => {
      const schedule = { firstMonth: 3, day: 15 };
      const first = exDayOnOrAfter(schedule, 'semi-annual', day(2022, 1, 1));
      const second = exDayOnOrAfter(schedule, 'semi-annual', first + 1);
      expect(tickToDateTime(dayStartTick(first)).month).toBe(3);
      expect(tickToDateTime(dayStartTick(second)).month).toBe(9);
    });
  });

  describe('announcementDay', () => {
    it('lies 20 market days before the ex-date', () => {
      // Wednesday, 10.02.2021 → four weeks earlier.
      expect(announcementDay(day(2021, 2, 10))).toBe(day(2021, 1, 13));
      expect(weekdayOfDay(announcementDay(day(2021, 2, 10)))).toBe(WEDNESDAY);
    });
  });

  describe('paymentDay', () => {
    it('lies two bank working days after the ex-date', () => {
      expect(paymentDay(day(2021, 2, 10))).toBe(day(2021, 2, 12));
      // Thursday → Monday.
      expect(paymentDay(day(2021, 2, 11))).toBe(day(2021, 2, 15));
    });
  });

  describe('dividendCents', () => {
    it('splits the yearly yield over the payments and rounds to cents', () => {
      expect(dividendCents(0.03, 'quarterly', 50)).toBe(38);
      expect(dividendCents(0.03, 'annual', 50)).toBe(150);
      expect(dividendCents(0.02, 'semi-annual', 10.05)).toBe(10);
      expect(dividendCents(0.01, 'quarterly', 0.5)).toBe(0);
    });
  });

  describe('exMarkdown', () => {
    it('lowers the open by the dividend', () => {
      const markdown = exMarkdown(50, 1.5, 0.01);
      expect(50 * Math.exp(-markdown)).toBeCloseTo(48.5, 10);
    });

    it('never drops the price below the floor', () => {
      expect((50 * Math.exp(-exMarkdown(1, 2, 0.01))) / 50).toBeCloseTo(0.01, 10);
    });
  });
});
