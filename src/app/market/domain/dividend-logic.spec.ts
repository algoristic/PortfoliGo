import fc from 'fast-check';

import {
  dateTimeToTick,
  dayIndex,
  dayStartTick,
  isBankWorkingDay,
  tickToDateTime,
  weekdayOfDay,
} from '@app/clock/domain/calendar-logic';
import { DividendSchedule } from '@app/world/domain/models/company.model';
import {
  DIVIDEND_FREQUENCIES,
  DividendFrequency,
  DIVIDENDS_PER_YEAR,
} from '@app/world/domain/models/taxonomy.model';

import {
  ANNOUNCEMENT_LEAD_DAYS,
  announcementDay,
  dividendCents,
  exDayOnOrAfter,
  exMarkdown,
  PAYMENT_LAG_DAYS,
  paymentDay,
} from './dividend-logic';
import { isMarketDay } from './market-calendar';

const MONDAY = 0;
const WEDNESDAY = 2;
/** Days from the epoch to the end of 2099, so that every scan stays inside the calendar. */
const LAST_DAY = dayIndex(dateTimeToTick({ year: 2099, month: 12, day: 31 }));

function day(year: number, month: number, dayOfMonth: number): number {
  return dayIndex(dateTimeToTick({ year, month, day: dayOfMonth }));
}

/** Is `d` a scheduled date (before moving it to a market day)? Brute force over the calendar. */
function isScheduled(schedule: DividendSchedule, frequency: DividendFrequency, d: number): boolean {
  const { month, day: dayOfMonth } = tickToDateTime(dayStartTick(d));
  const step = 12 / DIVIDENDS_PER_YEAR[frequency];
  return (
    dayOfMonth === schedule.day &&
    month >= schedule.firstMonth &&
    (month - schedule.firstMonth) % step === 0
  );
}

/** First market day on or after a scheduled date that is not before `from`, by scanning days. */
function referenceExDay(
  schedule: DividendSchedule,
  frequency: DividendFrequency,
  from: number,
): number {
  for (let d = from - 7; ; d++) {
    if (isScheduled(schedule, frequency, d)) {
      let exDay = d;
      while (!isMarketDay(exDay)) {
        exDay++;
      }
      if (exDay >= from) {
        return exDay;
      }
    }
  }
}

function countDays(from: number, to: number, predicate: (d: number) => boolean): number {
  let count = 0;
  for (let d = from; d <= to; d++) {
    count += predicate(d) ? 1 : 0;
  }
  return count;
}

const arbFrequency = fc.constantFrom(...DIVIDEND_FREQUENCIES);
const arbSchedule = (frequency: DividendFrequency): fc.Arbitrary<DividendSchedule> =>
  fc.record({
    firstMonth: fc.integer({ min: 1, max: 12 / DIVIDENDS_PER_YEAR[frequency] }),
    day: fc.integer({ min: 1, max: 28 }),
  });
const arbDay = fc.integer({ min: 30, max: LAST_DAY - 400 });

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

    it('is the first market day on or after a scheduled date, for any schedule (TS §6.5)', () => {
      fc.assert(
        fc.property(
          arbFrequency.chain((frequency) =>
            fc.tuple(fc.constant(frequency), arbSchedule(frequency)),
          ),
          arbDay,
          ([frequency, schedule], from) => {
            const exDay = exDayOnOrAfter(schedule, frequency, from);
            expect(exDay).toBe(referenceExDay(schedule, frequency, from));
            expect(isMarketDay(exDay)).toBe(true);
          },
        ),
      );
    });
  });

  describe('announcementDay', () => {
    it('lies 20 market days before the ex-date', () => {
      // Wednesday, 10.02.2021 → four weeks earlier.
      expect(announcementDay(day(2021, 2, 10))).toBe(day(2021, 1, 13));
      expect(weekdayOfDay(announcementDay(day(2021, 2, 10)))).toBe(WEDNESDAY);
    });

    it('is a market day with exactly 20 market days up to the ex-date, for any ex-date', () => {
      fc.assert(
        fc.property(arbDay.filter(isMarketDay), (exDay) => {
          const announcement = announcementDay(exDay);
          expect(isMarketDay(announcement)).toBe(true);
          expect(countDays(announcement, exDay - 1, isMarketDay)).toBe(ANNOUNCEMENT_LEAD_DAYS);
        }),
      );
    });
  });

  describe('paymentDay', () => {
    it('lies two bank working days after the ex-date', () => {
      expect(paymentDay(day(2021, 2, 10))).toBe(day(2021, 2, 12));
      // Thursday → Monday.
      expect(paymentDay(day(2021, 2, 11))).toBe(day(2021, 2, 15));
    });

    it('is the second bank working day after any ex-date', () => {
      const isWorkingDay = (d: number): boolean => isBankWorkingDay(dayStartTick(d));
      fc.assert(
        fc.property(arbDay.filter(isMarketDay), (exDay) => {
          const payment = paymentDay(exDay);
          expect(isWorkingDay(payment)).toBe(true);
          expect(countDays(exDay + 1, payment, isWorkingDay)).toBe(PAYMENT_LAG_DAYS);
        }),
      );
    });
  });

  describe('dividendCents', () => {
    // Yield × close ÷ payments per year in euros with four decimals, rounded half away from zero
    // to a hundredth of a cent (TS §6.5, 7.1b-09).
    it.each([
      { yield: 0.03, frequency: 'quarterly', close: 50, euros: '0.375', cents: 37.5 },
      { yield: 0.03, frequency: 'annual', close: 50, euros: '1.50', cents: 150 },
      { yield: 0.02, frequency: 'semi-annual', close: 10.05, euros: '0.1005', cents: 10.05 },
      { yield: 0.01, frequency: 'quarterly', close: 0.5, euros: '0.00125', cents: 0.13 },
      { yield: 0.025, frequency: 'quarterly', close: 0.79, euros: '0.0049375', cents: 0.49 },
      { yield: 0.0123, frequency: 'annual', close: 87.65, euros: '1.078095', cents: 107.81 },
    ] as const)(
      'pays $cents cents for $yield at $close € ($frequency, $euros €)',
      ({ yield: targetYield, frequency, close, cents }) => {
        expect(dividendCents(targetYield, frequency, close)).toBe(cents);
      },
    );
  });

  describe('exMarkdown', () => {
    it('lowers the open by the dividend', () => {
      const markdown = exMarkdown(50, 1.5, 0.01);
      expect(50 * Math.exp(-markdown)).toBeCloseTo(48.5, 10);
    });

    it('never drops the price below the floor', () => {
      expect((50 * Math.exp(-exMarkdown(1, 2, 0.01))) / 50).toBeCloseTo(0.01, 10);
    });

    it('takes the open down to open minus dividend, but not below the floor', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0.01, max: 5000, noNaN: true }),
          fc.double({ min: 0, max: 100, noNaN: true }),
          fc.double({ min: 1e-4, max: 0.01, noNaN: true }),
          (open, dividend, floor) => {
            const target = Math.max(open - dividend, floor);
            fc.pre(target <= open);
            const after = open * Math.exp(-exMarkdown(open, dividend, floor));
            expect(Math.abs(after / target - 1)).toBeLessThan(1e-12);
          },
        ),
      );
    });
  });
});
