import fc from 'fast-check';

import { SPEEDS } from '@app/clock/domain/models/speed.model';

import {
  backgroundPauseAt,
  backgroundPauseTick,
  isBackgroundPauseAfter,
  isBackgroundSpeed,
} from './background-logic';
import { BACKGROUND_PAUSE_AFTER_MINUTES } from './models/game-state.model';

const START_TICK = 5_389_920;
const START_MS = 1_794_441_600_000;
const MINUTE_MS = 60_000;

describe('background-logic', () => {
  describe('backgroundPauseTick', () => {
    // TS §3.6, examples "Frist verborgen": hidden from tick T at H with the anchor there.
    it.each([
      ['realtime', 30, 30],
      ['1h', 15, 54_000],
      ['1min', 60, 3_600],
      ['10min', 60, 36_000],
      ['1d', 15, 1_296_000],
    ] as const)('runs %s for %d min → T + %d', (speed, pauseAfter, ticks) => {
      const anchor = { tick: START_TICK, realTimeMs: START_MS };
      expect(backgroundPauseTick(anchor, START_MS, pauseAfter, speed)).toBe(START_TICK + ticks);
    });

    it('counts from the start of hiding when the anchor is newer', () => {
      // TS §3.6: a command after 10 min at T + 36,000, deadline 30 min after hiding.
      const anchor = { tick: START_TICK + 36_000, realTimeMs: START_MS + 10 * MINUTE_MS };
      expect(backgroundPauseTick(anchor, START_MS, 30, '1h')).toBe(START_TICK + 108_000);
    });

    it('stays at the anchor when it lies after the deadline', () => {
      const anchor = { tick: START_TICK, realTimeMs: START_MS + 60 * MINUTE_MS };
      expect(backgroundPauseTick(anchor, START_MS, 15, '1w')).toBe(START_TICK);
    });

    it('is null without a deadline', () => {
      const anchor = { tick: START_TICK, realTimeMs: START_MS };
      expect(backgroundPauseTick(anchor, START_MS, null, '1h')).toBeNull();
      expect(backgroundPauseAt(START_MS, null)).toBeNull();
    });
  });

  describe('isBackgroundSpeed', () => {
    it('accepts every speed of TS §3.4 and nothing else', () => {
      expect(SPEEDS.every(({ id }) => isBackgroundSpeed(id))).toBe(true);
      expect([null, undefined, '1y', '', 1, 'pause'].some(isBackgroundSpeed)).toBe(false);
    });
  });

  describe('isBackgroundPauseAfter', () => {
    it('accepts off and the choices of TS §3.6 only', () => {
      expect(isBackgroundPauseAfter(null)).toBe(true);
      expect(BACKGROUND_PAUSE_AFTER_MINUTES.every(isBackgroundPauseAfter)).toBe(true);
      fc.assert(
        fc.property(fc.integer({ min: -1_000, max: 1_000 }), (minutes) => {
          expect(isBackgroundPauseAfter(minutes)).toBe(
            [15, 30, 60, 120, 240, 480].includes(minutes),
          );
        }),
      );
      expect([undefined, '60', 60.5, Number.NaN].some(isBackgroundPauseAfter)).toBe(false);
    });
  });
});
