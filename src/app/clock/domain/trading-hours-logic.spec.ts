import fc from 'fast-check';

import { dateTimeToTick } from './calendar-logic';
import { TICKS_PER_DAY, TradingHours } from './models/time.model';
import { isTradingTime, nextClose, nextOpen } from './trading-hours-logic';

import { arbTick } from '../../../testing/arbitraries';

const EPOCH_MS = Date.UTC(2020, 0, 1);

/** Independent oracle: the weekday from the UTC calendar of `Date`. */
function isWeekday(tick: number): boolean {
  const utcDay = new Date(EPOCH_MS + Math.floor(tick / TICKS_PER_DAY) * 86_400_000).getUTCDay();
  return utcDay !== 0 && utcDay !== 6;
}

/** Brute force: the first weekday minute at or after `tick` whose minute of the day is `minute`. */
function scanForMinute(tick: number, minute: number): number {
  for (let t = tick; t < tick + 5 * TICKS_PER_DAY; t++) {
    if (t % TICKS_PER_DAY === minute && isWeekday(t)) {
      return t;
    }
  }
  throw new Error('no session within five days');
}

/** Any session within a day: opening minute included, closing minute excluded. */
const arbHours = fc
  .integer({ min: 0, max: TICKS_PER_DAY - 2 })
  .chain((open) =>
    fc
      .integer({ min: open + 1, max: TICKS_PER_DAY - 1 })
      .map((close): TradingHours => ({ open, close })),
  );

describe('trading-hours-logic', () => {
  // Trading hours of TS §3.3: sessions per exchange, closed on weekends.
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

  describe('isTradingTime, nextOpen and nextClose', () => {
    it('agree with a minute-by-minute scan for any session and tick', () => {
      fc.assert(
        fc.property(arbHours, arbTick(), (hours, tick) => {
          const minute = tick % TICKS_PER_DAY;
          expect(isTradingTime(hours, tick)).toBe(
            isWeekday(tick) && minute >= hours.open && minute < hours.close,
          );
          expect(nextOpen(hours, tick)).toBe(scanForMinute(tick, hours.open));
          expect(nextClose(hours, tick)).toBe(scanForMinute(tick, hours.close));
        }),
      );
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
