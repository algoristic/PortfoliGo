import fc from 'fast-check';

import { catchUpSeenAt, catchUpTarget } from './catch-up-logic';

const EPOCH_MS = Date.UTC(2020, 0, 1);
/** Wall clock of the examples: 12.11.2026, 12:00 UTC. */
const NOW_MS = Date.UTC(2026, 10, 12, 12);

/** Tick of a game date and time, independent of the calendar functions (`Date.UTC`). */
function tick(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return (Date.UTC(year, month - 1, day, hour, minute) - EPOCH_MS) / 60_000;
}

const SAVED = tick(2030, 4, 3, 10, 15);

describe('catchUpTarget', () => {
  // TS §3.7: target = saved tick + ⌊Δ / 60 s⌋ with Δ = now − lastSeenAt, negative Δ counts as 0.
  it.each([
    ['one hour', Date.UTC(2026, 10, 12, 11), tick(2030, 4, 3, 11, 15)],
    ['59 seconds', Date.UTC(2026, 10, 12, 11, 59, 1), SAVED],
    ['61 seconds', Date.UTC(2026, 10, 12, 11, 58, 59), SAVED + 1],
    ['one day and a half', Date.UTC(2026, 10, 11, 0), tick(2030, 4, 4, 22, 15)],
    ['a wall clock set back by a day', Date.UTC(2026, 10, 13, 12), SAVED],
    ['no absence', NOW_MS, SAVED],
  ])('catches up %s of real time while running in real-time mode', (_name, lastSeenAt, target) => {
    expect(catchUpTarget({ tick: SAVED, paused: false, lastSeenAt }, 'realtime', NOW_MS)).toBe(
      target,
    );
  });

  it('does not catch up a game the player paused', () => {
    const lastSeenAt = Date.UTC(2026, 10, 12, 11);
    expect(catchUpTarget({ tick: SAVED, paused: true, lastSeenAt }, 'realtime', NOW_MS)).toBe(
      SAVED,
    );
  });

  it('does not catch up in background mode pause', () => {
    const lastSeenAt = Date.UTC(2026, 10, 12, 11);
    expect(catchUpTarget({ tick: SAVED, paused: false, lastSeenAt }, 'pause', NOW_MS)).toBe(SAVED);
  });
});

describe('catchUpSeenAt', () => {
  it('stores 30 minutes of real time per 30 ticks still to catch up', () => {
    expect(catchUpSeenAt(NOW_MS, SAVED, SAVED + 30)).toBe(Date.UTC(2026, 10, 12, 11, 30));
  });

  it('continues an interrupted catch-up to its target plus the time since', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 10 * 86_400_000 }),
        (done, remaining, laterMs) => {
          const at = SAVED + done;
          const seenAt = catchUpSeenAt(NOW_MS, at, at + remaining);
          const clock = { tick: at, paused: false, lastSeenAt: seenAt };
          expect(catchUpTarget(clock, 'realtime', NOW_MS)).toBe(at + remaining);
          expect(catchUpTarget(clock, 'realtime', NOW_MS + laterMs)).toBe(
            at + remaining + Math.floor(laterMs / 60_000),
          );
        },
      ),
    );
  });
});
