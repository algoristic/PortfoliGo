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
    it('chains every day with the inflows at its start and the outflows at its end (E-43)', () => {
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
      // Salary and living costs never fall on the same day, so the sign of a day's flow tells them
      // apart.
      expect(points.some(({ flow }) => flow < 0)).toBe(true);
      let index = 1;
      let previous = MINI_START_CONDITIONS.startCapital + 50 * 10_000;
      for (const entry of points) {
        index *=
          entry.flow >= 0
            ? entry.netWorth / (previous + entry.flow)
            : (entry.netWorth - entry.flow) / previous;
        previous = entry.netWorth;
        expect(entry.index).toBeCloseTo(index, 9);
      }
      expect(points.at(-1)?.skippedDays).toBe(0);
    });

    it('leaves out the days with a negative net worth (no start capital, living costs before salary)', () => {
      const engine = setup(0);
      const { points } = run(engine, at(2030, 5, 2));
      const april = points.filter(({ day }) => day < dayIndex(at(2030, 4, 30)));
      expect(april).toHaveLength(29);
      expect(april.every(({ netWorth }) => netWorth < 0)).toBe(true);
      expect(april.map(({ skippedDays }) => skippedDays)).toEqual(
        Array.from({ length: 29 }, (_, i) => i + 1),
      );
      expect(april.every(({ index }) => index === 1)).toBe(true);
      // On the salary day the player could chain the day, but the benchmark starts it with a
      // negative cash amount: both leave it out.
      const salaryDay = points[29];
      expect(salaryDay.flow).toBe(MINI_START_CONDITIONS.netIncome);
      expect(salaryDay.netWorth).toBeGreaterThan(0);
      expect(april[28].benchmarkValue).toBeLessThan(0);
      expect(salaryDay.skippedDays).toBe(30);
      expect(salaryDay.index).toBe(1);
      // 01.05.: the living costs make the day end negative again.
      expect(points[30].netWorth).toBeLessThan(0);
      expect(points[30].skippedDays).toBe(31);
      const figures = engine.performanceFigures(engine.securitiesValue());
      expect(figures.today.ratio).toBeNull();
      expect(figures.skippedDays).toBe(32);
      expect(figures.mostlySkipped).toBe(true);
      expect(figures.returns.sinceStart).toBeNull();
      expect(figures.benchmark?.returns.sinceStart).toBeNull();
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
      const index = 1 + (figures.returns.sinceStart ?? Number.NaN);
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

  // Review 7.1c-01/-02, E-43: a cash-only player with 500 € start capital, 2.500 € income and
  // 1.800 € living costs on the real market of the mini world for five years. The old convention
  // gave −8,73 % p. a. (one day −32 %) and a benchmark of +15 % against a world index at −34 %.
  describe('US-PF-05: 500 € start capital (E-43)', () => {
    it('has no outlier day and gives the benchmark the index return on the chained days', () => {
      const { seedKey, world: mini } = miniWorld(TEST_SEEDS.smallBase);
      const small = createGameWorld(seedKey, mini);
      const until = at(2035, 4, 1);
      const player = GameEngine.start(small, {
        startCapital: 50_000,
        netIncome: 250_000,
        livingCosts: 180_000,
      });
      player.runUntil(until);
      const points = player.drainDailyPoints();
      // Reference: a rich player without flows, whose benchmark is the pure index.
      const rich = GameEngine.start(small, { startCapital: 1e9, netIncome: 0, livingCosts: 0 });
      rich.runUntil(until);
      const reference = rich.drainDailyPoints();
      expect(reference.at(-1)?.skippedDays).toBe(0);
      expect(points).toHaveLength(reference.length);

      // April and May 2030: the living costs make every day end negative until the salary, and
      // the benchmark starts the salary day with negative cash. From June on every day counts.
      const twoMonths = dayIndex(at(2030, 6, 1)) - dayIndex(at(2030, 4, 1));
      expect(points.map(({ skippedDays }) => skippedDays)).toEqual(
        points.map((_, i) => Math.min(i + 1, twoMonths)),
      );

      let previous = 1;
      let worst = 0;
      let benchmark = 1;
      points.forEach((entry, i) => {
        worst = Math.min(worst, entry.index / previous - 1);
        previous = entry.index;
        if (i > 0 && entry.skippedDays === points[i - 1].skippedDays) {
          benchmark *=
            (reference[i].benchmarkIndex ?? Number.NaN) /
            (reference[i - 1].benchmarkIndex ?? Number.NaN);
        }
      });
      expect(worst).toBeGreaterThan(-0.02);
      expect((points.at(-1)?.benchmarkIndex ?? Number.NaN) / benchmark).toBeCloseTo(1, 9);

      const figures = player.performanceFigures(player.securitiesValue());
      expect(figures.mostlySkipped).toBe(false);
      expect(figures.returns.annualized).toBeGreaterThan(-0.02);
      expect(figures.returns.annualized).toBeLessThanOrEqual(0);
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
