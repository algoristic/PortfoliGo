import fc from 'fast-check';

import { TradingHours } from '@app/clock/domain/models/time.model';

import { jumpTargetTick, maxJumpTick } from './jump-target-logic';

const EPOCH_MS = Date.UTC(2020, 0, 1);
const MS_PER_MINUTE = 60_000;

/** Tick of a game date and time, independent of the calendar functions (`Date.UTC`). */
function tick(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return (Date.UTC(year, month - 1, day, hour, minute) - EPOCH_MS) / MS_PER_MINUTE;
}

// TS §3.3: Europe 09:00–17:30, Asia-Pacific 01:00–07:00.
const EUROPE: TradingHours = { open: 540, close: 1_050 };
const ASIA: TradingHours = { open: 60, close: 420 };

describe('maxJumpTick', () => {
  // PS US-ZT-05: at most one year ahead (TS §3.7).
  it.each([
    [tick(2030, 4, 1), tick(2031, 4, 1)],
    [tick(2030, 12, 31, 23, 59), tick(2031, 12, 31, 23, 59)],
    [tick(2032, 2, 29, 12, 30), tick(2033, 2, 28, 12, 30)],
    [tick(2031, 2, 28, 8, 0), tick(2032, 2, 28, 8, 0)],
  ])('is one calendar year after %d → %d', (now, expected) => {
    expect(maxJumpTick(now)).toBe(expected);
  });
});

describe('jumpTargetTick', () => {
  describe('next-open', () => {
    // TS §3.7: the next opening of any exchange strictly after now; weekends are closed.
    it.each([
      ['Mon 00:00', tick(2030, 4, 1), tick(2030, 4, 1, 1)],
      ['Mon 01:00 at an opening', tick(2030, 4, 1, 1), tick(2030, 4, 1, 9)],
      ['Mon 12:00', tick(2030, 4, 1, 12), tick(2030, 4, 2, 1)],
      ['Fri 22:00', tick(2030, 4, 5, 22), tick(2030, 4, 8, 1)],
      ['Sat 10:00', tick(2030, 4, 6, 10), tick(2030, 4, 8, 1)],
    ])('jumps from %s to the next opening', (_label, now, expected) => {
      expect(jumpTargetTick({ kind: 'next-open' }, now, [EUROPE, ASIA])).toBe(expected);
    });

    it('is invalid without exchanges', () => {
      expect(jumpTargetTick({ kind: 'next-open' }, tick(2030, 4, 1), [])).toBeNull();
    });

    it('finds the first opening after now (brute force over the minutes)', () => {
      const arbHours = fc
        .tuple(fc.integer({ min: 0, max: 1_438 }), fc.integer({ min: 1, max: 1_439 }))
        .map(([open, length]): TradingHours => ({ open, close: Math.min(1_440, open + length) }));
      fc.assert(
        fc.property(
          fc.integer({ min: tick(2030, 1, 1), max: tick(2040, 1, 1) }),
          fc.array(arbHours, { minLength: 1, maxLength: 4 }),
          (now, sessions) => {
            const result = jumpTargetTick({ kind: 'next-open' }, now, sessions);
            let expected = now + 1;
            while (!isOpening(expected, sessions)) {
              expected++;
            }
            expect(result).toBe(expected);
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('next-month', () => {
    it.each([
      [tick(2030, 4, 1), tick(2030, 5, 1)],
      [tick(2030, 4, 30, 23, 59), tick(2030, 5, 1)],
      [tick(2030, 12, 31, 23, 59), tick(2031, 1, 1)],
    ])('jumps from %d to %d', (now, expected) => {
      expect(jumpTargetTick({ kind: 'next-month' }, now, [EUROPE])).toBe(expected);
    });
  });

  describe('date', () => {
    const now = tick(2030, 4, 1, 12);

    it.each([
      ['one minute ahead', now + 1, now + 1],
      ['exactly one year ahead', tick(2031, 4, 1, 12), tick(2031, 4, 1, 12)],
      ['now', now, null],
      ['in the past', now - 1, null],
      ['one minute beyond a year', tick(2031, 4, 1, 12) + 1, null],
      ['not a whole minute', now + 1.5, null],
    ])('accepts %s only within (now, now + 1 year]', (_label, target, expected) => {
      expect(jumpTargetTick({ kind: 'date', tick: target }, now, [EUROPE])).toBe(expected);
    });
  });
});

function isOpening(candidate: number, sessions: readonly TradingHours[]): boolean {
  const date = new Date(EPOCH_MS + candidate * MS_PER_MINUTE);
  const weekday = date.getUTCDay();
  const minute = date.getUTCHours() * 60 + date.getUTCMinutes();
  return weekday !== 0 && weekday !== 6 && sessions.some((hours) => hours.open === minute);
}
