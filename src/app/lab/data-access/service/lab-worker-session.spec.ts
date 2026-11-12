import { dateTimeToTick, GAME_START_TICK } from '@app/clock/domain/calendar-logic';
import { TICKS_PER_DAY, TICKS_PER_MINUTE } from '@app/clock/domain/models/time.model';

import { LabWorkerSession } from './lab-worker-session';

describe('LabWorkerSession', () => {
  let session: LabWorkerSession;
  let time: number;

  beforeAll(() => {
    time = 0;
    // Every clock reading advances by 10 ms, so durations are deterministic.
    session = new LabWorkerSession(() => (time += 10));
  });

  describe('handle', () => {
    it('answers with an error before a world was generated', () => {
      expect(session.handle({ id: 1, type: 'simulate', days: 1 })).toEqual({
        id: 1,
        type: 'error',
        message: 'LabWorkerSession: generate a world first',
      });
    });

    it('generates the world with the normalized seed and timings', () => {
      const response = session.handle({ id: 2, type: 'generate', seed: ' Lab ' });
      expect(response.type).toBe('generate');
      if (response.type !== 'generate') {
        return;
      }
      expect(response.id).toBe(2);
      expect(response.result.seed).toBe('lab');
      expect(response.result.now).toBe(GAME_START_TICK - TICKS_PER_MINUTE);
      expect(response.result.overview.companies.length).toBeGreaterThan(0);
      expect(response.result.worldMs).toBe(10);
      expect(response.result.prehistoryMs).toBe(10);
    });

    it('simulates days and loads candles of the simulated period', () => {
      expect(session.handle({ id: 3, type: 'simulate', days: 7 })).toEqual({
        id: 3,
        type: 'simulate',
        result: {
          days: 7,
          marketDays: 5,
          now: GAME_START_TICK + 7 * TICKS_PER_DAY - TICKS_PER_MINUTE,
          durationMs: 10,
        },
      });

      const response = session.handle({
        id: 4,
        type: 'candles',
        series: 0,
        resolution: '1d',
        fromTick: GAME_START_TICK,
        toTick: GAME_START_TICK + 7 * TICKS_PER_DAY,
        source: 'minutes',
      });
      expect(response.type).toBe('candles');
      if (response.type === 'candles') {
        expect(response.result.candles).toHaveLength(5);
        expect(response.result).toMatchObject({ series: 0, resolution: '1d', durationMs: 10 });
      }
    });

    it('simulates years and computes statistics of the period after the game start', () => {
      expect(session.handle({ id: 6, type: 'simulate-years', years: 1 })).toMatchObject({
        id: 6,
        type: 'simulate-years',
        result: { now: dateTimeToTick({ year: 2031, month: 4, day: 8 }) - TICKS_PER_MINUTE },
      });
      const response = session.handle({ id: 7, type: 'statistics', start: 'game-start' });
      expect(response.type).toBe('statistics');
      if (response.type === 'statistics') {
        expect(response.result.durationMs).toBe(10);
        expect(response.result.statistics).toMatchObject({
          start: 'game-start',
          fromTick: GAME_START_TICK,
        });
      }
    });

    it('answers with an error for invalid requests', () => {
      expect(session.handle({ id: 5, type: 'simulate', days: 0 })).toMatchObject({
        id: 5,
        type: 'error',
      });
    });
  });
});
