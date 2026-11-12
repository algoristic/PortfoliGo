import { dateTimeToTick, GAME_START_TICK } from '@app/clock/domain/calendar-logic';
import { TICKS_PER_DAY, TICKS_PER_MINUTE } from '@app/clock/domain/models/time.model';

import { LabWorkerSession } from './lab-worker-session';

/** A new session whose clock advances by 10 ms per reading, so durations are deterministic. */
function createSession(): LabWorkerSession {
  let time = 0;
  return new LabWorkerSession(() => (time += 10));
}

describe('LabWorkerSession', () => {
  describe('handle', () => {
    it('answers with an error before a world was generated', () => {
      expect(createSession().handle({ id: 1, type: 'simulate', days: 1 })).toEqual({
        id: 1,
        type: 'error',
        message: 'LabWorkerSession: generate a world first',
      });
    });

    it('answers every request of a session with the matching id and type', () => {
      const session = createSession();

      const generated = session.handle({ id: 11, type: 'generate', seed: ' Lab ' });
      expect(generated).toMatchObject({
        id: 11,
        type: 'generate',
        result: {
          seed: 'lab',
          now: GAME_START_TICK - TICKS_PER_MINUTE,
          worldMs: 10,
          prehistoryMs: 10,
        },
      });
      if (generated.type === 'generate') {
        expect(generated.result.overview.companies.length).toBeGreaterThan(0);
      }

      // Invalid input fails the request but keeps the session.
      expect(session.handle({ id: 12, type: 'simulate', days: 0 })).toMatchObject({
        id: 12,
        type: 'error',
      });

      // The game starts on a Monday, so seven calendar days have five market days.
      expect(session.handle({ id: 13, type: 'simulate', days: 7 })).toEqual({
        id: 13,
        type: 'simulate',
        result: {
          days: 7,
          marketDays: 5,
          now: GAME_START_TICK + 7 * TICKS_PER_DAY - TICKS_PER_MINUTE,
          durationMs: 10,
        },
      });

      const candles = session.handle({
        id: 14,
        type: 'candles',
        series: 0,
        resolution: '1d',
        fromTick: GAME_START_TICK,
        toTick: GAME_START_TICK + 7 * TICKS_PER_DAY,
        source: 'minutes',
      });
      expect(candles).toMatchObject({
        id: 14,
        type: 'candles',
        result: { series: 0, resolution: '1d', durationMs: 10 },
      });
      if (candles.type === 'candles') {
        expect(candles.result.candles).toHaveLength(5);
      }

      // One year later on the same calendar date: Monday, 08.04.2030 → Tuesday, 08.04.2031.
      expect(session.handle({ id: 15, type: 'simulate-years', years: 1 })).toMatchObject({
        id: 15,
        type: 'simulate-years',
        result: { now: dateTimeToTick({ year: 2031, month: 4, day: 8 }) - TICKS_PER_MINUTE },
      });

      expect(session.handle({ id: 16, type: 'statistics', start: 'game-start' })).toMatchObject({
        id: 16,
        type: 'statistics',
        result: { durationMs: 10, statistics: { start: 'game-start', fromTick: GAME_START_TICK } },
      });
    });
  });
});
