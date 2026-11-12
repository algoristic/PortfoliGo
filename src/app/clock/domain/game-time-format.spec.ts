import { dateTimeToTick, GAME_START_TICK } from './calendar-logic';
import { formatGameDate, formatGameTime, formatGameWeekdayTime } from './game-time-format';

describe('game-time-format', () => {
  describe('formatGameTime', () => {
    it('formats weekday, date and time', () => {
      expect(formatGameTime(GAME_START_TICK)).toBe('Mo., 01.04.2030, 00:00');
      expect(
        formatGameTime(dateTimeToTick({ year: 2032, month: 2, day: 29, hour: 17, minute: 5 })),
      ).toBe('So., 29.02.2032, 17:05');
    });
  });

  describe('formatGameWeekdayTime', () => {
    it('formats weekday and time', () => {
      expect(formatGameWeekdayTime(GAME_START_TICK)).toBe('Mo., 00:00');
      expect(
        formatGameWeekdayTime(
          dateTimeToTick({ year: 2030, month: 4, day: 6, hour: 17, minute: 30 }),
        ),
      ).toBe('Sa., 17:30');
    });
  });

  describe('formatGameDate', () => {
    it('formats the date only', () => {
      const tick = dateTimeToTick({ year: 2030, month: 4, day: 1, hour: 23, minute: 59 });
      expect(formatGameDate(tick)).toBe('01.04.2030');
    });
  });
});
