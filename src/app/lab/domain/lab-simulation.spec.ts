import {
  dateTimeToTick,
  dayStartTick,
  GAME_START_TICK,
  weekday,
} from '@app/clock/domain/calendar-logic';
import { TICKS_PER_DAY, TICKS_PER_MINUTE } from '@app/clock/domain/models/time.model';

import { LabSimulation } from './lab-simulation';

const SEED = 'lab-test';

/** Last minute of a calendar date, as `now` after stepping whole days. */
function endOf(year: number, month: number, day: number): number {
  return dateTimeToTick({ year, month, day }) + TICKS_PER_DAY - TICKS_PER_MINUTE;
}

describe('LabSimulation', () => {
  /** After the prehistory and never stepped; the read-only tests share it. */
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
      // The game starts on Monday, 01.04.2030 (TS §3.1).
      expect(simulation.now).toBe(endOf(2030, 3, 31));
    });
  });

  describe('input checks', () => {
    it('rejects invalid numbers of days and years', () => {
      expect(() => simulation.simulate(0)).toThrow(RangeError);
      expect(() => simulation.simulate(1.5)).toThrow(RangeError);
      expect(() => simulation.simulateYears(0)).toThrow(RangeError);
    });

    it('needs a simulated period after the game start for its statistics', () => {
      expect(() => simulation.statistics('game-start')).toThrow(RangeError);
    });

    it('rejects intraday resolutions from the support points', () => {
      expect(() => simulation.candles(0, '1h', 0, simulation.now, 'support')).toThrow(RangeError);
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
  });

  describe('supportCandles', () => {
    it('gives the opens and closes of the minute curves for shares, indices and etfs', () => {
      const { companies, indices, series } = simulation.overview();
      // Two trading weeks: an index needs the minute curves of all its constituents.
      const from = GAME_START_TICK - 14 * TICKS_PER_DAY;
      for (const s of [0, companies.length, companies.length + indices.length, series.length - 1]) {
        const minutes = simulation.candles(s, '1d', from, simulation.now);
        const support = simulation.candles(s, '1d', from, simulation.now, 'support');
        expect(support.map(({ tick, open, close }) => ({ tick, open, close }))).toEqual(
          minutes.map(({ tick, open, close }) => ({ tick, open, close })),
        );
      }
    });

    it('aggregates weeks starting on Monday', () => {
      const weeks = simulation.candles(0, '1w', 0, simulation.now, 'support');
      // About ten years and three months of prehistory.
      expect(weeks.length).toBeGreaterThan(530);
      expect(weeks.every((week) => weekday(week.tick) === 0)).toBe(true);
    });
  });

  describe('measureSeedRun', () => {
    it('collects while simulating what the statistics recompute for the same period', () => {
      const run = LabSimulation.measureSeedRun('  LAB-Test ', 1);
      const recomputed = new LabSimulation(SEED);
      recomputed.runPrehistory();
      recomputed.simulateYears(1);
      const statistics = recomputed.statistics('epoch');
      const target = (id: string): number | undefined =>
        statistics.targets.find((row) => row.id === id)?.value;

      expect(run.seed).toBe(SEED);
      expect(run.years).toBe(1);
      expect(run.marketDays).toBe(statistics.marketDays);
      expect(run.phaseShares).toEqual(statistics.phaseShares);
      expect(run.worldReturn).toBe(target('world-return'));
      expect(run.worldVolatility).toBe(target('world-volatility'));
      expect(run.worldDividendYield).toBe(target('world-dividend-yield'));
      expect(run.longTerm).toEqual(statistics.longTerm);
      // 11¼ years from the epoch: the game start and two ten-year windows (from 2020 and 2021).
      expect(run.longTerm.checkpoints[0].tick).not.toBeNull();
      expect(run.longTerm.windows.map((window) => window.count)).toEqual([2, 0]);
    });

    it('rejects invalid numbers of years', () => {
      expect(() => LabSimulation.measureSeedRun(SEED, 0)).toThrow(RangeError);
      expect(() => LabSimulation.measureSeedRun(SEED, 2.5)).toThrow(RangeError);
    });
  });

  describe('stepping', () => {
    it('steps calendar days and gives the same candles in one run as in two partial runs', () => {
      const once = new LabSimulation(SEED);
      once.runPrehistory();
      const twice = new LabSimulation(SEED);
      twice.runPrehistory();

      // From Monday, 01.04.2030: 40 calendar days end on Friday, 10.05.2030 with 30 weekdays.
      expect(once.simulate(40)).toEqual({ days: 40, marketDays: 30, now: endOf(2030, 5, 10) });
      twice.simulate(15);
      twice.simulate(25);

      expect(twice.now).toBe(once.now);
      expect(twice.candles(3, '1d', GAME_START_TICK, twice.now)).toEqual(
        once.candles(3, '1d', GAME_START_TICK, once.now),
      );
      expect(twice.statistics('game-start')).toEqual(once.statistics('game-start'));
      expect(once.statistics('game-start').fromTick).toBe(GAME_START_TICK);

      // Never candles after now, even when asked for later ones.
      const candles = once.candles(0, '1h', GAME_START_TICK, once.now + 10 * TICKS_PER_DAY);
      expect(candles.length).toBeGreaterThan(0);
      expect(candles.every((candle) => candle.tick <= once.now)).toBe(true);
      expect(candles.at(-1)?.tick).toBeLessThan(once.now);

      // Years step to the same calendar date: 11.05.2032 starts after the last stepped day.
      const step = twice.simulateYears(2);
      expect(twice.now).toBe(endOf(2032, 5, 10));
      expect(step.days).toBe(365 + 366);
    });
  });
});
