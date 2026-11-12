import { parseDateTimeInput, toDateInputValue, toTimeInputValue } from './game-time-input';

const EPOCH_MS = Date.UTC(2020, 0, 1);
const MS_PER_MINUTE = 60_000;

/** Tick of a game date and time, independent of the calendar functions (`Date.UTC`). */
function tick(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return (Date.UTC(year, month - 1, day, hour, minute) - EPOCH_MS) / MS_PER_MINUTE;
}

describe('game-time-input', () => {
  describe('toDateInputValue and toTimeInputValue', () => {
    it.each([
      [tick(2030, 4, 1), '2030-04-01', '00:00'],
      [tick(2032, 2, 29, 17, 5), '2032-02-29', '17:05'],
      [tick(2030, 12, 31, 23, 59), '2030-12-31', '23:59'],
    ])('gives the input values of tick %d', (at, date, time) => {
      expect(toDateInputValue(at)).toBe(date);
      expect(toTimeInputValue(at)).toBe(time);
    });
  });

  describe('parseDateTimeInput', () => {
    it.each([
      ['2030-05-01', '00:00', tick(2030, 5, 1)],
      ['2030-05-01', '', tick(2030, 5, 1)],
      ['2032-02-29', '17:05', tick(2032, 2, 29, 17, 5)],
      ['2030-12-31', '23:59', tick(2030, 12, 31, 23, 59)],
      ['2031-01-01', '00:00', tick(2031, 1, 1)],
    ])('reads %s %s', (date, time, expected) => {
      expect(parseDateTimeInput(date, time)).toBe(expected);
    });

    it.each([
      ['', '00:00'],
      ['2030-5-1', '00:00'],
      ['01.05.2030', '00:00'],
      ['2030-00-10', '00:00'],
      ['2030-13-10', '00:00'],
      ['2030-04-00', '00:00'],
      ['2030-04-31', '00:00'],
      ['2031-02-29', '00:00'],
      ['2030-05-01', '24:00'],
      ['2030-05-01', '12:60'],
      ['2030-05-01', '9:30'],
      ['2030-05-01', '09:30:00'],
    ])('rejects %s %s', (date, time) => {
      expect(parseDateTimeInput(date, time)).toBeNull();
    });
  });
});
