import fc from 'fast-check';

import {
  dividendYield,
  marketDayOnOrBefore,
  marketDaysEndingAt,
  monthsBackDay,
  performanceReferenceDay,
  relativeChange,
  trailingDividendDays,
} from './performance-logic';

const DAY_MS = 86_400_000;
const EPOCH_MS = Date.UTC(2020, 0, 1);

/** Day index of a date, independent of the calendar functions (`Date.UTC`). */
function day(year: number, month: number, dayOfMonth: number): number {
  return (Date.UTC(year, month - 1, dayOfMonth) - EPOCH_MS) / DAY_MS;
}

function weekday(dayIndex: number): number {
  return new Date(EPOCH_MS + dayIndex * DAY_MS).getUTCDay();
}

function isWeekday(dayIndex: number): boolean {
  const w = weekday(dayIndex);
  return w !== 0 && w !== 6;
}

describe('monthsBackDay', () => {
  // TS §8.2: calendar months back, clamped to the end of a shorter month.
  it.each([
    ['15.06.2030 − 1', day(2030, 6, 15), 1, day(2030, 5, 15)],
    ['31.05.2030 − 3', day(2030, 5, 31), 3, day(2030, 2, 28)],
    ['31.03.2032 − 1 (leap year)', day(2032, 3, 31), 1, day(2032, 2, 29)],
    ['31.12.2030 − 6', day(2030, 12, 31), 6, day(2030, 6, 30)],
    ['15.01.2031 − 1 (year before)', day(2031, 1, 15), 1, day(2030, 12, 15)],
    ['29.02.2032 − 12', day(2032, 2, 29), 12, day(2031, 2, 28)],
    ['10.04.2030 − 60', day(2030, 4, 10), 60, day(2025, 4, 10)],
  ])('maps %s months', (_label, from, months, expected) => {
    expect(monthsBackDay(from, months)).toBe(expected);
  });

  it('agrees with the UTC calendar for any day and period', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 40_000 }), fc.integer({ min: 0, max: 120 }), (d, n) => {
        const date = new Date(EPOCH_MS + d * DAY_MS);
        const total = date.getUTCFullYear() * 12 + date.getUTCMonth() - n;
        const year = Math.floor(total / 12);
        const month = total - year * 12;
        const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const expected =
          (Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)) - EPOCH_MS) / DAY_MS;
        expect(monthsBackDay(d, n)).toBe(expected);
      }),
    );
  });
});

describe('marketDayOnOrBefore', () => {
  it.each([
    ['a Wednesday', day(2030, 4, 3), day(2030, 4, 3)],
    ['a Saturday', day(2030, 4, 6), day(2030, 4, 5)],
    ['a Sunday', day(2030, 4, 7), day(2030, 4, 5)],
  ])('maps %s', (_label, from, expected) => {
    expect(marketDayOnOrBefore(from)).toBe(expected);
  });
});

describe('performance reference days', () => {
  // TS §8.2: table of the reference days (1 / 6 / 12 / 60 months).
  it.each([
    [day(2030, 6, 12), [day(2030, 5, 10), day(2029, 12, 12), day(2029, 6, 12), day(2025, 6, 12)]],
    [day(2030, 6, 15), [day(2030, 5, 15), day(2029, 12, 14), day(2029, 6, 15), day(2025, 6, 13)]],
    [day(2031, 3, 31), [day(2031, 2, 28), day(2030, 9, 30), day(2030, 3, 29), day(2026, 3, 31)]],
  ])('refers day %d to %j', (today, expected) => {
    expect([1, 6, 12, 60].map((months) => performanceReferenceDay(today, months))).toEqual(
      expected,
    );
  });
});

describe('performanceReferenceDay', () => {
  // TS §8.2: last market day on or before the date months back.
  it.each([
    ['Wed 12.06.2030, 1 month: Sun 12.05. → Fri 10.05.', day(2030, 6, 12), 1, day(2030, 5, 10)],
    ['Mon 30.09.2030, 1 month: Fri 30.08.', day(2030, 9, 30), 1, day(2030, 8, 30)],
    ['Mon 31.03.2031, 1 month: Fri 28.02.', day(2031, 3, 31), 1, day(2031, 2, 28)],
    ['Fri 30.05.2031, 1 month: Wed 30.04.', day(2031, 5, 30), 1, day(2031, 4, 30)],
    [
      'Sat 15.06.2030, 6 months: Sat 15.12.2029 → Fri 14.12.',
      day(2030, 6, 15),
      6,
      day(2029, 12, 14),
    ],
    [
      'Mon 03.06.2030, 12 months: Sun 03.06.2029 → Fri 01.06.',
      day(2030, 6, 3),
      12,
      day(2029, 6, 1),
    ],
    ['Thu 13.06.2030, 60 months: Fri 13.06.2025', day(2030, 6, 13), 60, day(2025, 6, 13)],
  ])('refers %s', (_label, today, months, expected) => {
    expect(performanceReferenceDay(today, months)).toBe(expected);
  });

  it('gives no reference day before the epoch', () => {
    expect(performanceReferenceDay(day(2024, 6, 1), 60)).toBeNull();
    // 01.01.2020 is a Wednesday, the first market day.
    expect(performanceReferenceDay(day(2020, 2, 1), 1)).toBe(0);
  });
});

describe('marketDaysEndingAt', () => {
  it('lists the weekdays ending at the day, oldest first', () => {
    // Fri 05.04.2030 back over two weekends.
    expect(marketDaysEndingAt(day(2030, 4, 5), 7)).toEqual([
      day(2030, 3, 28),
      day(2030, 3, 29),
      day(2030, 4, 1),
      day(2030, 4, 2),
      day(2030, 4, 3),
      day(2030, 4, 4),
      day(2030, 4, 5),
    ]);
  });

  it('stops at the epoch', () => {
    // Thu 02.01.2020: Wednesday 01.01. is day 0.
    expect(marketDaysEndingAt(1, 21)).toEqual([0, 1]);
  });

  it('gives count ascending weekdays that end at the day', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 40_000 }),
        fc.integer({ min: 1, max: 30 }),
        (d, n) => {
          const last = isWeekday(d) ? d : d - (weekday(d) === 6 ? 1 : 2);
          const days = marketDaysEndingAt(last, n);
          expect(days).toHaveLength(n);
          expect(days.at(-1)).toBe(last);
          days.forEach((each, i) => {
            expect(isWeekday(each)).toBe(true);
            if (i > 0) {
              // No weekday left out in between.
              for (let between = days[i - 1] + 1; between < each; between++) {
                expect(isWeekday(between)).toBe(false);
              }
            }
          });
        },
      ),
    );
  });
});

describe('trailingDividendDays', () => {
  it('covers the weekdays after the same date a year before, up to today', () => {
    const today = day(2030, 6, 12);
    const days = trailingDividendDays(today);
    expect(days[0]).toBe(day(2029, 6, 13));
    expect(days.at(-1)).toBe(today);
    const brute: number[] = [];
    for (let d = day(2029, 6, 13); d <= today; d++) {
      if (isWeekday(d)) {
        brute.push(d);
      }
    }
    expect(days).toEqual(brute);
  });

  it('leaves out today on a weekend', () => {
    expect(trailingDividendDays(day(2030, 6, 15)).at(-1)).toBe(day(2030, 6, 14));
  });
});

describe('relativeChange and dividendYield', () => {
  it.each([
    [110, 100, 0.1],
    [90, 100, -0.1],
    [100, 100, 0],
  ])('changes from %d to %d by %d', (last, reference, expected) => {
    expect(relativeChange(last, reference)).toBeCloseTo(expected, 12);
  });

  it('divides dividends in cents by the price in euros', () => {
    // 1.20 € on 40 € = 3 %.
    expect(dividendYield(120, 40)).toBeCloseTo(0.03, 12);
    expect(dividendYield(0, 40)).toBe(0);
  });
});
