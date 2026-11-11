import { dateTimeToTick } from './calendar-logic';
import { TradingHours } from './models/time.model';
import { isTradingTime, nextClose, nextOpen } from './trading-hours-logic';

describe('trading-hours-logic', () => {
  const europe: TradingHours = { open: 540, close: 1050 }; // 09:00–17:30
  const asiaPacific: TradingHours = { open: 60, close: 420 }; // 01:00–07:00
  // 01.04.2030 is a Monday, 05.04.2030 a Friday.
  const at = (day: number, hour: number, minute = 0): number =>
    dateTimeToTick({ year: 2030, month: 4, day, hour, minute });

  describe('isTradingTime', () => {
    it('is open from the opening minute up to the minute before closing', () => {
      expect(isTradingTime(europe, at(1, 8, 59))).toBe(false);
      expect(isTradingTime(europe, at(1, 9))).toBe(true);
      expect(isTradingTime(europe, at(1, 17, 29))).toBe(true);
      expect(isTradingTime(europe, at(1, 17, 30))).toBe(false);
    });

    it('is closed on weekends', () => {
      expect(isTradingTime(europe, at(6, 12))).toBe(false);
      expect(isTradingTime(europe, at(7, 12))).toBe(false);
    });

    it('handles sessions early in the day', () => {
      expect(isTradingTime(asiaPacific, at(1, 0, 59))).toBe(false);
      expect(isTradingTime(asiaPacific, at(1, 1))).toBe(true);
      expect(isTradingTime(asiaPacific, at(1, 6, 59))).toBe(true);
      expect(isTradingTime(asiaPacific, at(1, 7))).toBe(false);
    });
  });

  describe('nextOpen', () => {
    it('returns the same tick at the opening minute', () => {
      expect(nextOpen(europe, at(1, 9))).toBe(at(1, 9));
    });

    it('returns the opening of the same day before the session', () => {
      expect(nextOpen(europe, at(1, 3))).toBe(at(1, 9));
    });

    it('returns the opening of the next session during a session', () => {
      expect(nextOpen(europe, at(1, 12))).toBe(at(2, 9));
    });

    it('returns Monday after a Friday session', () => {
      expect(nextOpen(europe, at(5, 18))).toBe(at(8, 9));
    });

    it('returns Monday on a weekend', () => {
      expect(nextOpen(asiaPacific, at(6, 12))).toBe(at(8, 1));
    });
  });

  describe('nextClose', () => {
    it('returns the closing of the running session', () => {
      expect(nextClose(europe, at(1, 12))).toBe(at(1, 17, 30));
    });

    it('returns the same tick at the closing minute', () => {
      expect(nextClose(europe, at(1, 17, 30))).toBe(at(1, 17, 30));
    });

    it('returns the end of the next session after closing', () => {
      expect(nextClose(europe, at(1, 18))).toBe(at(2, 17, 30));
    });

    it('returns the end of the Monday session on a weekend', () => {
      expect(nextClose(europe, at(6, 12))).toBe(at(8, 17, 30));
    });
  });
});
