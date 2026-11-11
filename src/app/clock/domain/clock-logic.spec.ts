import { fasterSpeed, slowerSpeed, speedById, targetTick } from './clock-logic';
import { ClockAnchor, SPEEDS } from './models/speed.model';
import { TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_WEEK } from './models/time.model';

describe('clock-logic', () => {
  const anchor: ClockAnchor = { tick: 5_389_920, realTimeMs: 1_800_000_000_000 };

  describe('speedById', () => {
    it('returns the speed with its game seconds per second', () => {
      expect(speedById('1h')).toEqual({ id: '1h', gameSecondsPerSecond: 3600 });
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

    it('stays exact after a long time in real time', () => {
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(targetTick(anchor, anchor.realTimeMs + thirtyDaysMs, 'realtime')).toBe(
        anchor.tick + 30 * TICKS_PER_DAY,
      );
    });
  });
});
