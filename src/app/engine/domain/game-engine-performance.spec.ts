import { Transaction } from '@app/banking/domain/models/ledger.model';
import { dateTimeToTick, dayIndex } from '@app/clock/domain/calendar-logic';
import { Tick, TICKS_PER_HOUR } from '@app/clock/domain/models/time.model';
import { seriesIds } from '@app/market/domain/series';
import { DailyPoint } from '@app/portfolio/domain/models/performance.model';
import { Cents } from '@app/shared/domain/models/money.model';
import { miniWorld } from '@app/world/domain/testing/mini-world';

import { GameEngine } from './game-engine';
import { createGameWorld } from './game-world';
import { GameSnapshot, GameState, StartConditions } from './models/game-state.model';
import { GameWorld } from './models/game-world.model';
import { benchmarkSeries } from './performance-system';
import { MINI_START_CONDITIONS } from './testing/mini-game';
import { TestMarket, TestPrice } from './testing/test-market';

import { TEST_SEEDS } from '../../../testing/seeds';

// Daily series, time-weighted return and benchmark in the engine (TS §3.8 step 4, §7.9; US-PF-01,
// US-PF-04, US-PF-05) against the test market: shares and ETFs at 100 €, the world performance
// index at 200 until Sunday 07.04.2030 and at 220 from Monday 08.04.2030. The home bank of the
// mini world books the living costs on the first and the salary on the last bank working day of
// the month (TS §7.4); the expected flows come from the journal.

const SHARE = 1_000_000;

function at(year: number, month: number, day: number, hour = 0): Tick {
  return dateTimeToTick({ year, month, day, hour });
}

const LEVEL_CHANGE = at(2030, 4, 8);

/** Salary − living costs of the journal per calendar day. */
function flowsByDay(journal: readonly Transaction[]): Map<number, Cents> {
  const flows = new Map<number, Cents>();
  for (const { tick, type, postings } of journal) {
    if (type === 'salary' || type === 'living-costs') {
      const own = postings.find(({ balanceAfter }) => balanceAfter !== null);
      const day = dayIndex(tick);
      flows.set(day, (flows.get(day) ?? 0) + (own?.amount ?? 0));
    }
  }
  return flows;
}

describe('GameEngine performance', () => {
  let world: GameWorld;
  let ids: string[];
  let benchmark: number;
  const starts = new Map<
    number,
    { start: GameSnapshot; monthStarts: ReturnType<GameEngine['monthStartsAfter']> }
  >();

  beforeAll(() => {
    const { seedKey, world: mini } = miniWorld(TEST_SEEDS.mini);
    world = createGameWorld(seedKey, mini);
    ids = seriesIds(world.context);
    benchmark = benchmarkSeries(world)?.series ?? -1;
  });

  function startOf(startCapital: Cents): {
    start: GameSnapshot;
    monthStarts: ReturnType<GameEngine['monthStartsAfter']>;
  } {
    let entry = starts.get(startCapital);
    if (entry === undefined) {
      const conditions: StartConditions = { ...MINI_START_CONDITIONS, startCapital };
      const engine = GameEngine.start(world, conditions);
      entry = { start: engine.snapshot(), monthStarts: engine.monthStartsAfter(-1) };
      starts.set(startCapital, entry);
    }
    return entry;
  }

  function prices(sharePrice: readonly TestPrice[] = [{ tick: 0, price: 100 }]): () => TestMarket {
    const series: TestPrice[][] = ids.map(() => [{ tick: 0, price: 100 }]);
    series[0] = [...sharePrice];
    series[benchmark] = [
      { tick: 0, price: 200 },
      { tick: LEVEL_CHANGE, price: 220 },
    ];
    return () => new TestMarket(series, 0);
  }

  function setup(
    startCapital: Cents = MINI_START_CONDITIONS.startCapital,
    sharePrice?: readonly TestPrice[],
    held = 0,
  ): GameEngine {
    const { start, monthStarts } = startOf(startCapital);
    const state = structuredClone(start) as GameState;
    if (held > 0) {
      // Shares bought before the start; the start value includes them.
      state.player.positions = [
        {
          depotId: 'dep-1',
          instrumentId: ids[0],
          quantity: held * SHARE,
          lots: [{ buyTick: 0, quantity: held * SHARE, cost: held * 10_000 }],
          realizedGain: 0,
          distributions: 0,
        },
      ];
      const value = held * 10_000;
      const { performance } = state.player;
      state.player.performance = {
        ...performance,
        startValue: performance.startValue + value,
        dayStartValue: performance.dayStartValue + value,
        benchmark:
          performance.benchmark === null
            ? null
            : {
                ...performance.benchmark,
                pending: performance.benchmark.pending + value,
                dayStartValue: performance.benchmark.dayStartValue + value,
              },
      };
    }
    return GameEngine.restore(world, state, { monthStarts, prices: prices(sharePrice) });
  }

  function run(engine: GameEngine, target: Tick): { points: DailyPoint[]; journal: Transaction[] } {
    engine.runUntil(target);
    return { points: engine.drainDailyPoints(), journal: engine.drainTransactions() };
  }

  it('has a world performance index to buy', () => {
    expect(benchmark).toBeGreaterThan(0);
    expect(ids[benchmark]).toMatch(/-tr$/);
  });

  describe('daily series (US-PF-04)', () => {
    it('writes one point for every calendar day at its end, weekends included', () => {
      const engine = setup();
      const { points, journal } = run(engine, at(2030, 5, 1, 12));
      expect(points.map(({ day }) => day)).toEqual(
        Array.from({ length: 30 }, (_, i) => dayIndex(at(2030, 4, 1)) + i),
      );
      expect(points.map(({ tick }) => tick)).toEqual(
        Array.from({ length: 30 }, (_, i) => at(2030, 4, 2) + i * 24 * TICKS_PER_HOUR),
      );
      const flows = flowsByDay(journal);
      expect(flows.get(dayIndex(at(2030, 4, 1)))).toBeLessThan(0);
      expect(flows.get(dayIndex(at(2030, 4, 30)))).toBe(MINI_START_CONDITIONS.netIncome);
      let total = 0;
      for (const entry of points) {
        total += flows.get(entry.day) ?? 0;
        expect(entry.flow).toBe(flows.get(entry.day) ?? 0);
        expect(entry.totalFlow).toBe(total);
        expect(entry.comparison).toBe(MINI_START_CONDITIONS.startCapital + total);
        expect(entry.securities).toBe(0);
        expect(entry.cash).toBe(entry.netWorth);
      }
    });

    it('splits cash and securities at the bid of the day end', () => {
      const engine = setup(
        MINI_START_CONDITIONS.startCapital,
        [
          { tick: 0, price: 100 },
          { tick: at(2030, 4, 2, 10), price: 110 },
        ],
        10,
      );
      const { points } = run(engine, at(2030, 4, 3, 12));
      expect(points.map(({ securities }) => securities)).toEqual([100_000, 110_000]);
      expect(points[1].cash).toBe(points[1].netWorth - 110_000);
    });
  });

  describe('time-weighted return (US-PF-05)', () => {
    it('chains every day with its flows at the start', () => {
      const engine = setup(
        MINI_START_CONDITIONS.startCapital,
        [
          { tick: 0, price: 100 },
          { tick: at(2030, 4, 10, 10), price: 120 },
          { tick: at(2030, 4, 20, 10), price: 90 },
        ],
        50,
      );
      const { points } = run(engine, at(2030, 6, 2));
      let index = 1;
      let previous = MINI_START_CONDITIONS.startCapital + 50 * 10_000;
      for (const entry of points) {
        index *= entry.netWorth / (previous + entry.flow);
        previous = entry.netWorth;
        expect(entry.index).toBeCloseTo(index, 9);
      }
      expect(points.at(-1)?.skippedDays).toBe(0);
    });

    it('leaves out the days with V_start + CF ≤ 0 (no start capital, living costs before salary)', () => {
      const engine = setup(0);
      const { points } = run(engine, at(2030, 5, 2));
      const april = points.filter(({ day }) => day < dayIndex(at(2030, 4, 30)));
      expect(april).toHaveLength(29);
      expect(april.every(({ netWorth }) => netWorth < 0)).toBe(true);
      expect(april.map(({ skippedDays }) => skippedDays)).toEqual(
        Array.from({ length: 29 }, (_, i) => i + 1),
      );
      expect(april.every(({ index }) => index === 1)).toBe(true);
      const salaryDay = points[29];
      expect(salaryDay.flow).toBe(MINI_START_CONDITIONS.netIncome);
      expect(salaryDay.skippedDays).toBe(29);
      expect(salaryDay.index).toBeCloseTo(
        salaryDay.netWorth / (april[28].netWorth + salaryDay.flow),
        12,
      );
      const figures = engine.performanceFigures(engine.securitiesValue());
      const last = points[points.length - 1];
      expect(figures.skippedDays).toBe(
        last.skippedDays + (last.netWorth + figures.today.flow <= 0 ? 1 : 0),
      );
    });

    it('measures the year to date from the end of 31 December', () => {
      const engine = setup(
        MINI_START_CONDITIONS.startCapital,
        [
          { tick: 0, price: 100 },
          { tick: at(2030, 12, 10, 10), price: 120 },
          { tick: at(2031, 1, 8, 10), price: 132 },
        ],
        50,
      );
      const { points } = run(engine, at(2031, 1, 20, 12));
      const yearEnd = points.find(({ day }) => day === dayIndex(at(2030, 12, 31)));
      const figures = engine.performanceFigures(engine.securitiesValue());
      const index = 1 + figures.returns.sinceStart;
      expect(yearEnd).toBeDefined();
      expect(figures.returns.yearToDate).toBeCloseTo(
        index / (yearEnd?.index ?? Number.NaN) - 1,
        12,
      );
      expect(figures.returns.yearToDate).toBeGreaterThan(0);
      expect(figures.returns.annualized).toBeNull();
    });
  });

  describe('benchmark (US-PF-05)', () => {
    it('buys the world index at its closes with the start capital and every net inflow', () => {
      const engine = setup();
      const { points, journal } = run(engine, at(2030, 5, 2));
      const flows = flowsByDay(journal);
      const day8 = dayIndex(LEVEL_CHANGE);
      let before = MINI_START_CONDITIONS.startCapital;
      for (const [day, flow] of flows) {
        before += day < day8 ? flow : 0;
      }
      // At 200 everything is worth what flowed in; from Monday 08.04. the units rise by 10 %.
      for (const entry of points) {
        if (entry.day < day8) {
          expect(entry.benchmarkValue).toBe(entry.comparison);
        } else {
          expect(entry.benchmarkValue).toBe(Math.round(before * 1.1) + (entry.comparison - before));
        }
      }
      expect(points.find(({ day }) => day === day8)?.benchmarkIndex).toBeCloseTo(
        (before * 1.1) / before,
        12,
      );
    });

    it('values the benchmark at the index level now', () => {
      const engine = setup();
      run(engine, at(2030, 4, 10, 12));
      const figures = engine.performanceFigures(engine.securitiesValue());
      const comparison = figures.comparison;
      expect(figures.benchmark?.value).toBe(Math.round(comparison * 1.1));
      expect(figures.benchmark?.returns.sinceStart).toBeCloseTo(0.1, 12);
    });
  });

  describe('figures (US-PF-01)', () => {
    it('shows the change today without the flows of the day', () => {
      const engine = setup(
        MINI_START_CONDITIONS.startCapital,
        [
          { tick: 0, price: 100 },
          { tick: at(2030, 4, 30, 10), price: 105 },
        ],
        20,
      );
      const { points } = run(engine, at(2030, 4, 30, 12));
      const figures = engine.performanceFigures(engine.securitiesValue());
      const yesterday = points.at(-1);
      expect(figures.today.flow).toBe(MINI_START_CONDITIONS.netIncome);
      expect(figures.today.change).toBe(
        figures.netWorth - (yesterday?.netWorth ?? Number.NaN) - MINI_START_CONDITIONS.netIncome,
      );
      expect(figures.today.change).toBe(20 * 500);
      expect(figures.sinceStart).toBe(figures.netWorth - figures.comparison);
    });
  });

  describe('determinism', () => {
    it('writes the same series in one run, in slices and across snapshots', () => {
      const target = at(2030, 7, 3);
      const whole = setup(0);
      const expected = run(whole, target).points;
      let sliced = setup(0);
      const points: DailyPoint[] = [];
      for (let tick = sliced.tick + 777; tick < target; tick += 7_919) {
        points.push(...run(sliced, tick).points);
        sliced = GameEngine.restore(world, sliced.snapshot(), {
          monthStarts: startOf(0).monthStarts,
          prices: prices(),
        });
      }
      points.push(...run(sliced, target).points);
      expect(points).toEqual(expected);
      expect(sliced.snapshot().player.performance).toEqual(whole.snapshot().player.performance);
    });
  });
});
