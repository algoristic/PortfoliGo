import { dateTimeToTick, dayIndex } from '@app/clock/domain/calendar-logic';

import { checkpointDay, rollingWindows, sameDateLater } from './long-term-statistics';

const DAYS_PER_YEAR = 261;

function day(year: number, month: number, dayOfMonth: number): number {
  return dayIndex(dateTimeToTick({ year, month, day: dayOfMonth }));
}

describe('long-term-statistics', () => {
  describe('sameDateLater', () => {
    it('keeps the calendar date and moves 29 February to 1 March', () => {
      expect(sameDateLater(day(2030, 4, 1), 10)).toBe(day(2040, 4, 1));
      expect(sameDateLater(day(2032, 2, 29), 1)).toBe(day(2033, 3, 1));
      expect(sameDateLater(day(2032, 2, 29), 4)).toBe(day(2036, 2, 29));
    });
  });

  describe('checkpointDay', () => {
    // The game starts on Monday, 01.04.2030 (TS §3.1); a checkpoint is the last market day before
    // the same date n years later.
    it.each([
      [0, day(2030, 3, 29)], // Friday before the game start
      [10, day(2040, 3, 30)], // 01.04.2040 is a Sunday
      [25, day(2055, 3, 31)], // 01.04.2055 is a Thursday
      [50, day(2080, 3, 29)], // 01.04.2080 is a Monday
      [100, day(2130, 3, 31)], // 01.04.2130 is a Saturday
    ])('takes the last market day before game start + %i years', (years, expected) => {
      expect(checkpointDay(years)).toBe(expected);
    });
  });

  describe('rollingWindows', () => {
    // Three years of closes: the price index grows by G per day, the total return index by G + Y.
    const G = 0.0004;
    const Y = 0.0001;
    const count = 3 * DAYS_PER_YEAR + 1;
    const price = Float64Array.from({ length: count }, (_, d) => 100 * Math.exp(G * d));
    const totalReturn = Float64Array.from({ length: count }, (_, d) => 100 * Math.exp((G + Y) * d));

    it('shifts windows by one year and leaves out windows that do not fit', () => {
      expect(rollingWindows(price, totalReturn, 1, DAYS_PER_YEAR).count).toBe(3);
      expect(rollingWindows(price, totalReturn, 2, DAYS_PER_YEAR).count).toBe(2);
      expect(rollingWindows(price, totalReturn, 3, DAYS_PER_YEAR).count).toBe(1);
      const none = rollingWindows(price, totalReturn, 4, DAYS_PER_YEAR);
      expect(none.count).toBe(0);
      expect(none.totalReturn.median).toBeNaN();
    });

    it('measures return, volatility and dividend yield per window', () => {
      const windows = rollingWindows(price, totalReturn, 2, DAYS_PER_YEAR);
      const expectedReturn = Math.exp((G + Y) * DAYS_PER_YEAR) - 1;
      for (const value of Object.values(windows.totalReturn)) {
        expect(value).toBeCloseTo(expectedReturn, 12);
      }
      // Constant daily returns have no volatility.
      expect(windows.volatility.max).toBeCloseTo(0, 12);
      expect(windows.dividendYield.median).toBeCloseTo(Y * DAYS_PER_YEAR, 12);
    });

    it('orders minimum, median and maximum over the windows', () => {
      // The second year doubles the growth of the total return index.
      const uneven = Float64Array.from({ length: count }, (_, d) => {
        const fast = Math.min(Math.max(d - DAYS_PER_YEAR, 0), DAYS_PER_YEAR);
        return 100 * Math.exp((G + Y) * d + G * fast);
      });
      const { totalReturn: range } = rollingWindows(price, uneven, 1, DAYS_PER_YEAR);
      expect(range.min).toBeCloseTo(Math.exp((G + Y) * DAYS_PER_YEAR) - 1, 12);
      expect(range.median).toBeCloseTo(Math.exp((G + Y) * DAYS_PER_YEAR) - 1, 12);
      expect(range.max).toBeCloseTo(Math.exp((2 * G + Y) * DAYS_PER_YEAR) - 1, 12);
    });
  });
});
