import fc from 'fast-check';

import { Throttle } from './throttle-logic';

describe('Throttle', () => {
  describe('isDue', () => {
    // TS §8.4: quotes at most 4 per second → one send per 250 ms.
    it.each([
      [0, false],
      [249, false],
      [250, true],
    ])('after a send at 1000 ms, a send %d ms later is due: %s', (afterMs, expected) => {
      const throttle = new Throttle(4);
      throttle.sent(1_000);
      expect(throttle.isDue(1_000 + afterMs)).toBe(expected);
    });

    it('is due before the first send', () => {
      expect(new Throttle(10).isDue(0)).toBe(true);
    });

    it('is due at once when the wall clock was set back', () => {
      const throttle = new Throttle(10);
      throttle.sent(5_000);
      expect(throttle.isDue(4_999)).toBe(true);
    });

    it('rejects a non-positive rate', () => {
      expect(() => new Throttle(0)).toThrow(RangeError);
      expect(() => new Throttle(Number.NaN)).toThrow(RangeError);
    });
  });

  describe('properties', () => {
    it('sends at most maxPerSecond times in any second and never stays silent longer than needed', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }),
          fc.array(fc.integer({ min: 0, max: 400 }), { minLength: 1, maxLength: 200 }),
          (maxPerSecond, gaps) => {
            const throttle = new Throttle(maxPerSecond);
            const sends: number[] = [];
            let nowMs = 0;
            for (const gap of gaps) {
              nowMs += gap;
              const last = sends[sends.length - 1];
              const due = throttle.isDue(nowMs);
              expect(due).toBe(last === undefined || (nowMs - last) * maxPerSecond >= 1_000);
              if (due) {
                throttle.sent(nowMs);
                sends.push(nowMs);
              }
            }
            for (const start of sends) {
              const inWindow = sends.filter((at) => at >= start && at < start + 1_000);
              expect(inWindow.length).toBeLessThanOrEqual(maxPerSecond);
            }
          },
        ),
      );
    });
  });
});
