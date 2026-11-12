import fc from 'fast-check';

import { fasterSpeed, slowerSpeed, speedById, targetTick } from './clock-logic';
import { ClockAnchor, SpeedId, SPEEDS } from './models/speed.model';
import { TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_WEEK } from './models/time.model';

describe('clock-logic', () => {
  const anchor: ClockAnchor = { tick: 5_389_920, realTimeMs: 1_800_000_000_000 };

  describe('speedById', () => {
    // Speed table of TS §3.4: game time per real second.
    it.each([
      ['realtime', 1],
      ['1min', 60],
      ['10min', 600],
      ['1h', 3_600],
      ['2h', 7_200],
      ['4h', 14_400],
      ['1d', 86_400],
      ['1w', 604_800],
    ] as const)('runs %s at %i game seconds per second', (id, gameSecondsPerSecond) => {
      expect(speedById(id)).toEqual({ id, gameSecondsPerSecond });
    });

    it('throws for an unknown speed', () => {
      expect(() => speedById('2w' as SpeedId)).toThrow();
    });
  });

  describe('fasterSpeed and slowerSpeed', () => {
    it('step through the speeds in order', () => {
      expect(fasterSpeed('realtime')).toBe('1min');
      expect(slowerSpeed('1d')).toBe('4h');
    });

    it('stay at the ends of the list', () => {
      expect(fasterSpeed('1w')).toBe('1w');
      expect(slowerSpeed('realtime')).toBe('realtime');
    });
  });

  describe('SPEEDS', () => {
    it('are ordered from slowest to fastest', () => {
      const rates = SPEEDS.map((speed) => speed.gameSecondsPerSecond);
      expect(rates).toEqual([...rates].sort((a, b) => a - b));
    });
  });

  describe('targetTick', () => {
    it('advances one tick per real minute in real time', () => {
      expect(targetTick(anchor, anchor.realTimeMs + 59_999, 'realtime')).toBe(anchor.tick);
      expect(targetTick(anchor, anchor.realTimeMs + 60_000, 'realtime')).toBe(anchor.tick + 1);
    });

    it('advances one tick per second at 1 min/s', () => {
      expect(targetTick(anchor, anchor.realTimeMs + 999, '1min')).toBe(anchor.tick);
      expect(targetTick(anchor, anchor.realTimeMs + 1000, '1min')).toBe(anchor.tick + 1);
    });

    it('advances an hour per second at 1 h/s', () => {
      expect(targetTick(anchor, anchor.realTimeMs + 1000, '1h')).toBe(anchor.tick + TICKS_PER_HOUR);
    });

    it('advances a week per second at 1 w/s', () => {
      expect(targetTick(anchor, anchor.realTimeMs + 1000, '1w')).toBe(anchor.tick + TICKS_PER_WEEK);
      expect(targetTick(anchor, anchor.realTimeMs + 500, '1w')).toBe(
        anchor.tick + 3.5 * TICKS_PER_DAY,
      );
    });

    it('does not go back when the wall clock was set back', () => {
      expect(targetTick(anchor, anchor.realTimeMs - 60_000, '1h')).toBe(anchor.tick);
    });

    it('equals the exact formula of TS §3.5 for any elapsed time below 2^53', () => {
      // Oracle: the same formula in BigInt, with one tick = one game minute = 60,000 game ms.
      fc.assert(
        fc.property(
          fc.constantFrom(...SPEEDS),
          fc.nat({ max: 10_000_000 }),
          fc.integer({ min: 0, max: 4e12 }),
          fc.double({ min: 0, max: 1, noNaN: true }),
          (speed, anchorTick, anchorMs, share) => {
            const maxElapsed = Math.floor((2 ** 53 - 1) / speed.gameSecondsPerSecond);
            const elapsed = Math.floor(share * maxElapsed);
            const expected =
              anchorTick + Number((BigInt(elapsed) * BigInt(speed.gameSecondsPerSecond)) / 60_000n);
            const start: ClockAnchor = { tick: anchorTick, realTimeMs: anchorMs };
            expect(targetTick(start, anchorMs + elapsed, speed.id)).toBe(expected);
          },
        ),
      );
    });

    it('never moves backwards and never falls below the anchor', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...SPEEDS.map((speed) => speed.id)),
          fc.integer({ min: -1e9, max: 1e9 }),
          fc.integer({ min: -1e9, max: 1e9 }),
          (speed, a, b) => {
            const [earlier, later] = a <= b ? [a, b] : [b, a];
            const first = targetTick(anchor, anchor.realTimeMs + earlier, speed);
            expect(first).toBeGreaterThanOrEqual(anchor.tick);
            expect(targetTick(anchor, anchor.realTimeMs + later, speed)).toBeGreaterThanOrEqual(
              first,
            );
          },
        ),
      );
    });

    it('stays exact after a long time in real time', () => {
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(targetTick(anchor, anchor.realTimeMs + thirtyDaysMs, 'realtime')).toBe(
        anchor.tick + 30 * TICKS_PER_DAY,
      );
    });
  });
});
