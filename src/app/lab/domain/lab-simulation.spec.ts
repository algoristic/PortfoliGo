import {
  dateTimeToTick,
  dayIndex,
  dayStartTick,
  GAME_START_TICK,
  weekday,
} from '@app/clock/domain/calendar-logic';
import { TICKS_PER_DAY, TICKS_PER_MINUTE } from '@app/clock/domain/models/time.model';

import { LabSimulation } from './lab-simulation';

const SEED = 'lab-test';

describe('LabSimulation', () => {
  let simulation: LabSimulation;

  beforeAll(() => {
    simulation = new LabSimulation(SEED);
    simulation.runPrehistory();
  });

  describe('constructor', () => {
    it('normalizes the seed and generates the same world for equivalent seeds', () => {
      const other = new LabSimulation('  LAB-Test ');
      expect(other.seed).toBe(SEED);
      expect(other.overview()).toEqual(simulation.overview());
    });
  });

  describe('overview', () => {
    it('numbers the series like the market: shares, indices, total return indices, etfs', () => {
      const { companies, indices, etfs, series } = simulation.overview();
      expect(series).toHaveLength(companies.length + 2 * indices.length + etfs.length);
      series.forEach((option, index) => expect(option.series).toBe(index));
      expect(series[0]).toMatchObject({ kind: 'stock', id: companies[0].id });
      expect(series[companies.length]).toMatchObject({ kind: 'index', id: indices[0].id });
      expect(series[companies.length + indices.length]).toMatchObject({
        kind: 'total-return',
        id: `${indices[0].id}-tr`,
      });
      expect(series[series.length - 1]).toMatchObject({ kind: 'etf', id: etfs.at(-1)?.id });
    });
  });

  describe('now', () => {
    it('throws before the prehistory', () => {
      expect(() => new LabSimulation(SEED).now).toThrow(/prehistory/);
    });

    it('is the minute before the game start after the prehistory', () => {
      expect(simulation.now).toBe(GAME_START_TICK - TICKS_PER_MINUTE);
    });
  });

  describe('simulate', () => {
    it('advances by calendar days and counts the market days', () => {
      const local = new LabSimulation(SEED);
      local.runPrehistory();
      // The game starts on a Monday, so one week has five market days.
      expect(local.simulate(7)).toEqual({
        days: 7,
        marketDays: 5,
        now: GAME_START_TICK + 7 * TICKS_PER_DAY - TICKS_PER_MINUTE,
      });
    });

    it('rejects invalid numbers of days', () => {
      expect(() => simulation.simulate(0)).toThrow(RangeError);
      expect(() => simulation.simulate(1.5)).toThrow(RangeError);
    });

    it('gives the same candles in one run as in two partial runs', () => {
      const once = new LabSimulation(SEED);
      once.runPrehistory();
      once.simulate(40);
      const twice = new LabSimulation(SEED);
      twice.runPrehistory();
      twice.simulate(15);
      twice.simulate(25);

      expect(twice.now).toBe(once.now);
      expect(twice.candles(3, '1d', GAME_START_TICK, twice.now)).toEqual(
        once.candles(3, '1d', GAME_START_TICK, once.now),
      );
    });
  });

  describe('simulateYears', () => {
    it('advances to the same calendar date years later', () => {
      const local = new LabSimulation(SEED);
      local.runPrehistory();
      const step = local.simulateYears(2);
      expect(step.days).toBe(
        dayIndex(dateTimeToTick({ year: 2032, month: 4, day: 1 })) - dayIndex(GAME_START_TICK),
      );
      expect(local.now).toBe(dateTimeToTick({ year: 2032, month: 4, day: 1 }) - TICKS_PER_MINUTE);
    });

    it('rejects invalid numbers of years', () => {
      expect(() => simulation.simulateYears(0)).toThrow(RangeError);
    });
  });

  describe('statistics', () => {
    it('covers the market days from the epoch up to now', () => {
      const result = simulation.statistics('epoch');
      expect(result.start).toBe('epoch');
      // The epoch 01.01.2020 is a Wednesday, so it is the first market day.
      expect(result.fromTick).toBe(dayStartTick(0));
      expect(result.toTick).toBeLessThanOrEqual(GAME_START_TICK);
      expect(result.phases.reduce((sum, segment) => sum + segment.marketDays, 0)).toBe(
        result.marketDays,
      );
      expect(result.targets.length).toBeGreaterThan(0);
    });

    it('needs a simulated period after the game start', () => {
      expect(() => simulation.statistics('game-start')).toThrow(RangeError);
      const local = new LabSimulation(SEED);
      local.runPrehistory();
      local.simulate(30);
      expect(local.statistics('game-start').fromTick).toBe(GAME_START_TICK);
    });
  });

  describe('supportCandles', () => {
    it('gives the opens and closes of the minute curves for shares, indices and etfs', () => {
      const { companies, indices, series } = simulation.overview();
      const from = GAME_START_TICK - 30 * TICKS_PER_DAY;
      for (const s of [0, companies.length, companies.length + indices.length, series.length - 1]) {
        const minutes = simulation.candles(s, '1d', from, simulation.now);
        const support = simulation.candles(s, '1d', from, simulation.now, 'support');
        expect(support.map(({ tick, open, close }) => ({ tick, open, close }))).toEqual(
          minutes.map(({ tick, open, close }) => ({ tick, open, close })),
        );
      }
    });

    it('aggregates weeks and rejects intraday resolutions', () => {
      const weeks = simulation.candles(0, '1w', 0, simulation.now, 'support');
      expect(weeks.length).toBeGreaterThan(500);
      expect(weeks.every((week) => weekday(week.tick) === 0)).toBe(true);
      expect(() => simulation.candles(0, '1h', 0, simulation.now, 'support')).toThrow(RangeError);
    });
  });

  describe('candles', () => {
    it('never returns candles after now', () => {
      const local = new LabSimulation(SEED);
      local.runPrehistory();
      local.simulate(3);
      const candles = local.candles(0, '1h', GAME_START_TICK, local.now + 10 * TICKS_PER_DAY);
      expect(candles.length).toBeGreaterThan(0);
      expect(candles.every((candle) => candle.tick <= local.now)).toBe(true);
      expect(candles.at(-1)?.tick).toBeLessThan(local.now);
    });
  });
});
