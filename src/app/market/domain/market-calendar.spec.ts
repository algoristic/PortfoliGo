import { dateTimeToTick, dayIndex } from '@app/clock/domain/calendar-logic';

import { isMarketDay, isMonthStartDay, marketDaysBefore } from './market-calendar';

describe('marketDaysBefore', () => {
  it('counts the market days before every day from 2020 to 2100', () => {
    const end = dayIndex(dateTimeToTick({ year: 2101, month: 1, day: 1 }));
    let count = 0;
    for (let day = 0; day <= end; day++) {
      expect(marketDaysBefore(day)).toBe(count);
      if (isMarketDay(day)) {
        count++;
      }
    }
  });
});

describe('isMonthStartDay', () => {
  it('marks exactly the first day of every month from 2020 to 2100', () => {
    const end = dayIndex(dateTimeToTick({ year: 2101, month: 1, day: 1 }));
    for (let day = 0; day <= end; day++) {
      // Day 0 is 01.01.2020 (TS §3.1).
      const date = new Date(Date.UTC(2020, 0, 1 + day));
      expect(isMonthStartDay(day)).toBe(date.getUTCDate() === 1);
    }
  });
});
