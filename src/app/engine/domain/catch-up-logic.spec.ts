import fc from 'fast-check';

import {
  catchUpHiddenSince,
  catchUpSeenAt,
  CatchUpSettings,
  catchUpTarget,
} from './catch-up-logic';
import {
  BACKGROUND_MODES,
  BACKGROUND_PAUSE_AFTER_MINUTES,
  BackgroundMode,
  BackgroundPauseAfter,
} from './models/game-state.model';

const EPOCH_MS = Date.UTC(2020, 0, 1);
/** Wall clock of the examples: 12.11.2026, 12:00 UTC. */
const NOW_MS = Date.UTC(2026, 10, 12, 12);

/** Tick of a game date and time, independent of the calendar functions (`Date.UTC`). */
function tick(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return (Date.UTC(year, month - 1, day, hour, minute) - EPOCH_MS) / 60_000;
}

const SAVED = tick(2030, 4, 3, 10, 15);
const REALTIME: CatchUpSettings = { backgroundMode: 'realtime', backgroundPauseAfter: null };

/** Wall clock at an hour and minute of the example day 12.11.2026. */
function wall(hour: number, minute = 0): number {
  return Date.UTC(2026, 10, 12, hour, minute);
}

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
    expect(catchUpTarget({ tick: SAVED, paused: false, lastSeenAt }, REALTIME, NOW_MS)).toEqual({
      target,
      paused: false,
    });
  });

  it('does not catch up a game the player paused', () => {
    const lastSeenAt = Date.UTC(2026, 10, 12, 11);
    expect(catchUpTarget({ tick: SAVED, paused: true, lastSeenAt }, REALTIME, NOW_MS)).toEqual({
      target: SAVED,
      paused: true,
    });
  });

  it('does not catch up in background mode pause', () => {
    const lastSeenAt = Date.UTC(2026, 10, 12, 11);
    const settings: CatchUpSettings = { backgroundMode: 'pause', backgroundPauseAfter: null };
    expect(catchUpTarget({ tick: SAVED, paused: false, lastSeenAt }, settings, NOW_MS)).toEqual({
      target: SAVED,
      paused: false,
    });
  });

  // TS §3.7, "Beispiele der Nachberechnung": now 12:00, chosen 1 w/s, background speed 1 d/s.
  it.each<[BackgroundMode, boolean, BackgroundPauseAfter, number | null, number, number, boolean]>([
    ['realtime', false, null, null, wall(10), 120, false],
    ['keep-speed', false, null, null, wall(10), 120, false],
    ['custom-speed', false, null, wall(9), wall(10), 120, false],
    ['pause', false, 30, null, wall(10), 0, false],
    ['keep-speed', true, 30, null, wall(10), 0, true],
    ['custom-speed', false, 60, null, wall(10), 60, true],
    ['realtime', false, 240, null, wall(10), 120, false],
    ['realtime', false, 120, null, wall(10), 120, true],
    ['keep-speed', false, 60, wall(9, 30), wall(10), 30, true],
    ['keep-speed', false, 15, wall(9), wall(10), 0, true],
    ['realtime', false, 30, null, wall(13), 0, false],
  ])(
    '%s, paused %s, deadline %s, hidden since %s, last seen %s → T + %d, paused %s',
    (backgroundMode, paused, backgroundPauseAfter, hiddenSince, lastSeenAt, ticks, pausedAfter) => {
      expect(
        catchUpTarget(
          { tick: SAVED, paused, lastSeenAt, hiddenSince },
          { backgroundMode, backgroundPauseAfter },
          NOW_MS,
        ),
      ).toEqual({ target: SAVED + ticks, paused: pausedAfter });
    },
  );

  it('never passes the tick of the deadline nor more than real time', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...BACKGROUND_MODES),
        fc.constantFrom(null, ...BACKGROUND_PAUSE_AFTER_MINUTES),
        fc.boolean(),
        fc.integer({ min: -86_400_000, max: 30 * 86_400_000 }),
        fc.option(fc.integer({ min: 0, max: 30 * 86_400_000 })),
        (backgroundMode, backgroundPauseAfter, paused, absentMs, hiddenBeforeMs) => {
          const lastSeenAt = NOW_MS - absentMs;
          const hiddenSince = hiddenBeforeMs === null ? null : lastSeenAt - hiddenBeforeMs;
          const result = catchUpTarget(
            { tick: SAVED, paused, lastSeenAt, hiddenSince },
            { backgroundMode, backgroundPauseAfter },
            NOW_MS,
          );
          expect(result.target).toBeGreaterThanOrEqual(SAVED);
          expect(result.target).toBeLessThanOrEqual(
            SAVED + Math.floor(Math.max(0, absentMs) / 60_000),
          );
          if (backgroundPauseAfter !== null) {
            const pauseAt = (hiddenSince ?? lastSeenAt) + backgroundPauseAfter * 60_000;
            expect(result.target).toBeLessThanOrEqual(
              SAVED + Math.floor(Math.max(0, pauseAt - lastSeenAt) / 60_000),
            );
          }
          if (paused || backgroundMode === 'pause') {
            expect(result.target).toBe(SAVED);
          }
          if (result.paused && !paused) {
            expect(backgroundPauseAfter).not.toBeNull();
          }
        },
      ),
    );
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
          expect(catchUpTarget(clock, REALTIME, NOW_MS).target).toBe(at + remaining);
          expect(catchUpTarget(clock, REALTIME, NOW_MS + laterMs).target).toBe(
            at + remaining + Math.floor(laterMs / 60_000),
          );
        },
      ),
    );
  });
});

describe('catchUpHiddenSince', () => {
  it('continues an interrupted catch-up that ends in the deadline pause to the same target', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<BackgroundMode>('realtime', 'keep-speed', 'custom-speed'),
        fc.constantFrom(...BACKGROUND_PAUSE_AFTER_MINUTES),
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 10 * 86_400_000 }),
        (backgroundMode, backgroundPauseAfter, done, remaining, laterMs) => {
          const settings = { backgroundMode, backgroundPauseAfter };
          const at = SAVED + done;
          const result = { target: at + remaining, paused: true };
          const clock = {
            tick: at,
            paused: false,
            lastSeenAt: catchUpSeenAt(NOW_MS, at, result.target),
            hiddenSince: catchUpHiddenSince(NOW_MS, result, settings, null),
          };
          expect(catchUpTarget(clock, settings, NOW_MS + laterMs)).toEqual(result);
        },
      ),
    );
  });

  it('keeps the host start of hiding when the catch-up does not end in a pause', () => {
    const settings: CatchUpSettings = { backgroundMode: 'keep-speed', backgroundPauseAfter: 30 };
    const result = { target: SAVED + 10, paused: false };
    expect(catchUpHiddenSince(NOW_MS, result, settings, wall(11))).toBe(wall(11));
    expect(catchUpHiddenSince(NOW_MS, result, settings, null)).toBeNull();
  });

  it('sets the deadline to now for a catch-up that ends in the deadline pause', () => {
    const settings: CatchUpSettings = { backgroundMode: 'realtime', backgroundPauseAfter: 30 };
    expect(catchUpHiddenSince(NOW_MS, { target: SAVED, paused: true }, settings, null)).toBe(
      wall(11, 30),
    );
  });
});
