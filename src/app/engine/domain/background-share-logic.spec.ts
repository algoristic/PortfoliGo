import fc from 'fast-check';

import { SPEEDS } from '@app/clock/domain/models/speed.model';

import { liveHighLow, WorkShare } from './background-share-logic';

describe('WorkShare', () => {
  // TS §6.8: share 10 %, at most 8 ms per slice, created at 0 ms.
  it.each([
    ['earns 1.6 ms in one loop interval', [{ at: 16 }], 1.6],
    ['holds at most one slice', [{ at: 1_000 }], 8],
    ['pays for a whole slice', [{ at: 1_000, spend: 8 }, { at: 1_016 }], 1.6],
    ['leaves a debt after an overlong slice', [{ at: 1_000, spend: 13 }, { at: 1_016 }], -3.4],
    ['has paid the debt 50 ms later', [{ at: 1_000, spend: 13 }, { at: 1_050 }], 0],
    ['earns nothing when the wall clock goes back', [{ at: 16 }, { at: 10 }], 1.6],
    ['earns again from the latest time seen', [{ at: 16 }, { at: 10 }, { at: 26 }], 2.6],
  ])('%s', (_name, steps: { at: number; spend?: number }[], expected) => {
    const share = new WorkShare(0.1, 8, 0);
    let available = 0;
    for (const { at, spend } of steps) {
      available = share.available(at);
      if (spend !== undefined) {
        share.spend(spend);
      }
    }
    expect(available).toBeCloseTo(expected, 9);
  });

  it('rejects shares outside (0, 1]', () => {
    expect(() => new WorkShare(0, 8, 0)).toThrow(RangeError);
    expect(() => new WorkShare(1.5, 8, 0)).toThrow(RangeError);
    expect(() => new WorkShare(Number.NaN, 8, 0)).toThrow(RangeError);
  });

  it('keeps the work within the share plus one slice and one overshoot', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 1, noNaN: true }),
        fc.array(
          fc.record({
            gap: fc.integer({ min: 0, max: 200 }),
            overshoot: fc.double({ min: 0, max: 30, noNaN: true }),
          }),
          { maxLength: 100 },
        ),
        (rate, slices) => {
          const maxSliceMs = 8;
          const share = new WorkShare(rate, maxSliceMs, 0);
          let now = 0;
          let spent = 0;
          for (const { gap, overshoot } of slices) {
            now += gap;
            const available = share.available(now);
            if (available > 0) {
              share.spend(available + overshoot);
              spent += available + overshoot;
            }
          }
          expect(spent).toBeLessThanOrEqual(rate * now + maxSliceMs + 30 + 1e-9);
        },
      ),
    );
  });
});

describe('liveHighLow', () => {
  // TS §6.8: up to 1 d/s the session close computes high and low live, at 1 w/s the job adds them.
  it.each([
    [null, true],
    ['realtime', true],
    ['4h', true],
    ['1d', true],
    ['1w', false],
  ] as const)('at speed %s with the limit 1d: %s', (speed, expected) => {
    expect(liveHighLow(speed, '1d')).toBe(expected);
  });

  it('computes high and low live at every speed up to the limit and at none above', () => {
    SPEEDS.forEach((limit, l) => {
      SPEEDS.forEach((speed, s) => {
        expect(liveHighLow(speed.id, limit.id)).toBe(s <= l);
      });
    });
  });
});
