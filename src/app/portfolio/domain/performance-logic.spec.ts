import fc from 'fast-check';

import { dateTimeToTick, dayIndex, dayStartTick } from '@app/clock/domain/calendar-logic';
import { TICKS_PER_DAY } from '@app/clock/domain/models/time.model';

import { DailyPoint, PerformanceState } from './models/performance.model';
import {
  addFlow,
  annualizedReturn,
  benchmarkReturn,
  benchmarkValue,
  closeDay,
  dailyReturn,
  externalFlow,
  historyFromDay,
  investAtClose,
  isMostlySkipped,
  performanceFigures,
  periodReturns,
  startPerformance,
  thinPoints,
} from './performance-logic';

function dayOf(year: number, month: number, day: number): number {
  return dayIndex(dateTimeToTick({ year, month, day }));
}

const START = dateTimeToTick({ year: 2030, month: 4, day: 1 });

/** Runs whole days: the flows of the day (one per transaction), then its end in cash. */
function runDays(
  state: PerformanceState,
  days: ReadonlyArray<{ flow: number | readonly number[]; end: number; close?: number }>,
): { state: PerformanceState; points: DailyPoint[] } {
  const points: DailyPoint[] = [];
  let current = state;
  for (const { flow, end, close } of days) {
    for (const single of typeof flow === 'number' ? [flow] : flow) {
      current = addFlow(current, single);
    }
    if (close !== undefined && current.benchmark !== null) {
      current = { ...current, benchmark: investAtClose(current.benchmark, close) };
    }
    const closed = closeDay(current, { cash: end, securities: 0 });
    current = closed.state;
    points.push(closed.point);
  }
  return { state: current, points };
}

function point(day: number, netWorth = 0): DailyPoint {
  return {
    day,
    tick: dayStartTick(day + 1),
    netWorth,
    cash: netWorth,
    securities: 0,
    flow: 0,
    totalFlow: 0,
    comparison: 0,
    index: 1,
    skippedDays: 0,
    benchmarkValue: null,
    benchmarkIndex: null,
  };
}

describe('externalFlow', () => {
  it('counts income and living costs only', () => {
    expect(
      externalFlow([
        { account: 'acc-1', amount: 280_000 },
        { account: 'external:employer', amount: -280_000 },
      ]),
    ).toBe(280_000);
    expect(
      externalFlow([
        { account: 'acc-1', amount: -170_000 },
        { account: 'external:living-costs', amount: 170_000 },
      ]),
    ).toBe(-170_000);
    for (const external of [
      'external:opening-balance',
      'external:tax-office',
      'external:market',
      'external:bank:b1:fees',
      'external:bank:b1:interest',
      'external:issuer:co-1',
    ] as const) {
      expect(
        externalFlow([
          { account: 'acc-1', amount: 1_000 },
          { account: external, amount: -1_000 },
        ]),
      ).toBe(0);
    }
    expect(
      externalFlow([
        { account: 'acc-1', amount: -500 },
        { account: 'acc-2', amount: 500 },
      ]),
    ).toBe(0);
  });
});

describe('dailyReturn', () => {
  // TS §7.9 „Zeitgewichtete Rendite“ and „Kleine Basis und negatives Vermögen“ (E-43): inflows at
  // the start, outflows at the end of the day
  it.each([
    [100_000, 0, 0, 101_000, 0.01],
    [101_000, 110_000, 0, 213_110, 0.01],
    [-7_000, 110_000, 0, 105_060, 0.02],
    [200_000, 0, -195_000, 4_500, -0.0025],
    [10_000, 100_000, -80_000, 29_900, 1_099 / 1_100 - 1],
    [-200, 100_000, 0, 99_800, 0],
    [10_000, 0, 0, 0, -1],
  ])(
    'returns the day of V_start %d, CF⁺ %d, CF⁻ %d, V_end %d as %d',
    (start, inflow, outflow, end, expected) => {
      expect(dailyReturn(start, inflow, outflow, end)).toBeCloseTo(expected, 12);
    },
  );

  it.each([
    [213_110, 0, -220_000, -7_000],
    [-7_000, 0, 0, -7_000],
    [1_000, 0, 0, -200],
    [0, 0, 0, 100],
    [-1_000, 1_000, 0, 100],
  ])(
    'leaves out the day of V_start %d, CF⁺ %d, CF⁻ %d, V_end %d',
    (start, inflow, outflow, end) => {
      expect(dailyReturn(start, inflow, outflow, end)).toBeNull();
    },
  );
});

describe('benchmarkReturn', () => {
  // TS §7.9 table „Benchmark“: all flows at the end of the day
  it.each([
    [100_000, 0, 100_000, 0],
    [100_000, 110_000, 220_000, 0.1],
    [220_000, 44_000, 264_000, 0],
    [264_000, 0, 275_000, 275_000 / 264_000 - 1],
    [275_000, -300_000, -61_904.76, 238_095.24 / 275_000 - 1],
  ])('returns the day of B_start %d, CF %d, B_end %d as %d', (start, flow, end, expected) => {
    expect(benchmarkReturn(start, flow, end)).toBeCloseTo(expected, 9);
  });

  it('counts a benchmark worth nothing at the end as −100 %', () => {
    expect(benchmarkReturn(10_000, 0, 0)).toBe(-1);
  });

  it.each([
    [-61_904.76, 0, -61_904.76],
    [0, 100_000, 100_000],
    [10_000, 0, -1],
  ])('leaves out the day of B_start %d, CF %d, B_end %d', (start, flow, end) => {
    expect(benchmarkReturn(start, flow, end)).toBeNull();
  });
});

describe('isMostlySkipped', () => {
  // TS §7.9: „–“ from half of the days of a period on (E-43)
  it.each([
    [0, 1, false],
    [1, 1, true],
    [2, 5, false],
    [3, 6, true],
    [3, 7, false],
  ])('judges %d left-out days of %d as mostly skipped: %s', (skipped, days, expected) => {
    expect(isMostlySkipped(skipped, days)).toBe(expected);
  });
});

describe('closeDay', () => {
  // TS §7.9 table „Zeitgewichtete Rendite“ (start capital 1.000,00 €, Mo 01.04.2030 – Fr 05.04.2030)
  it('chains the days, leaves out those with V_start + CF⁺ ≤ 0 or V_end < 0 and keeps the flows', () => {
    const { points, state } = runDays(startPerformance(START, 100_000, false), [
      { flow: 0, end: 101_000 },
      { flow: 110_000, end: 213_110 },
      { flow: -220_000, end: -7_000 },
      { flow: 0, end: -7_000 },
      { flow: 110_000, end: 105_060 },
    ]);
    expect(points.map(({ day }) => day)).toEqual([
      dayOf(2030, 4, 1),
      dayOf(2030, 4, 2),
      dayOf(2030, 4, 3),
      dayOf(2030, 4, 4),
      dayOf(2030, 4, 5),
    ]);
    expect(points[0].tick).toBe(dateTimeToTick({ year: 2030, month: 4, day: 2 }));
    const indices = [1.01, 1.0201, 1.0201, 1.0201, 1.040502];
    points.forEach((entry, i) => expect(entry.index).toBeCloseTo(indices[i], 9));
    expect(points.map(({ skippedDays }) => skippedDays)).toEqual([0, 0, 1, 2, 2]);
    expect(points.map(({ totalFlow }) => totalFlow)).toEqual([0, 110_000, -110_000, -110_000, 0]);
    expect(points.map(({ comparison }) => comparison)).toEqual([
      100_000, 210_000, -10_000, -10_000, 100_000,
    ]);
    expect(points[4].netWorth - points[4].comparison).toBe(5_060);
    expect(state.day).toBe(dayOf(2030, 4, 6));
    expect(state.dayStartValue).toBe(105_060);
  });

  // TS §7.9 table „Kleine Basis und negatives Vermögen“ (E-43, start capital 2.000,00 €)
  it('charges fixed costs to the value before the outflows and leaves out negative day ends', () => {
    const { points } = runDays(startPerformance(START, 200_000, false), [
      { flow: -195_000, end: 4_500 },
      { flow: [100_000, -103_000], end: 1_400 },
      { flow: 0, end: -100 },
      { flow: 0, end: -100 },
      { flow: 100_000, end: 99_900 },
    ]);
    const index = 0.9975 * (1_044 / 1_045);
    expect(points[0].index).toBeCloseTo(0.9975, 12);
    points.slice(1).forEach((entry) => expect(entry.index).toBeCloseTo(index, 12));
    expect(index - 1).toBeCloseTo(-0.0034545, 7);
    expect(points.map(({ skippedDays }) => skippedDays)).toEqual([0, 0, 1, 2, 2]);
    expect(points.map(({ flow }) => flow)).toEqual([-195_000, -3_000, 0, 0, 100_000]);
  });

  it('leaves the benchmark out of a day the player cannot chain', () => {
    const { points } = runDays(startPerformance(START, 100_000, true), [
      { flow: 0, end: 100_000, close: 200 },
      { flow: 0, end: -100, close: 220 },
      { flow: 100_000, end: 100_000, close: 220 },
    ]);
    expect(points.map(({ skippedDays }) => skippedDays)).toEqual([0, 1, 1]);
    expect(points[1].benchmarkIndex).toBe(1);
    expect(points[2].benchmarkIndex).toBeCloseTo(1, 12);
    expect(points[2].index).toBeCloseTo(100_000 / 99_900, 12);
  });

  it('leaves the player out of a day the benchmark cannot chain', () => {
    const start = startPerformance(START, 100_000, true);
    const state: PerformanceState = {
      ...start,
      benchmark: {
        units: 0,
        pending: -40_000,
        close: 200,
        dayStartValue: -40_000,
        index: 1.1,
        yearStartIndex: 1,
      },
    };
    const { point: entry, state: next } = closeDay(state, { cash: 101_000, securities: 0 });
    expect(entry.index).toBe(1);
    expect(entry.benchmarkIndex).toBe(1.1);
    expect(entry.skippedDays).toBe(1);
    expect(next.skippedDays).toBe(1);
  });

  // TS §7.9 „Jahreswechsel“
  it('takes the year start from the end of 31 December', () => {
    let state: PerformanceState = {
      ...startPerformance(START, 100_000, false),
      day: dayOf(2030, 12, 31),
      dayStartValue: 100_000,
      index: 1.02,
      skippedDays: 4,
    };
    state = closeDay(state, { cash: 102_941.18, securities: 0 }).state;
    expect(state.yearStartIndex).toBeCloseTo(1.05, 6);
    expect(state.yearStartDay).toBe(dayOf(2031, 1, 1));
    expect(state.yearStartSkippedDays).toBe(4);
    state = closeDay(state, { cash: 106_029.41, securities: 0 }).state;
    expect(state.yearStartIndex).toBeCloseTo(1.05, 6);
    expect(periodReturns(state.index, state.yearStartIndex, 300).yearToDate).toBeCloseTo(0.03, 6);
  });

  it('splits the net worth into cash and securities', () => {
    const { point: entry } = closeDay(startPerformance(START, 100_000, false), {
      cash: 40_000,
      securities: 61_000,
    });
    expect(entry).toMatchObject({ netWorth: 101_000, cash: 40_000, securities: 61_000 });
    expect(entry.benchmarkValue).toBeNull();
    expect(entry.benchmarkIndex).toBeNull();
  });

  it('keeps the TWR at V_end / V_start − 1 without flows', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }),
        fc.array(fc.integer({ min: 1, max: 10_000_000 }), { minLength: 1, maxLength: 30 }),
        (startValue, ends) => {
          const { points } = runDays(
            startPerformance(START, startValue, false),
            ends.map((end) => ({ flow: 0, end })),
          );
          const last = points[points.length - 1];
          // Chaining 1 + r loses digits when r is near −1 (FC_SEED=-266550119: 1 → 9999999 → 1).
          expect(last.index / (last.netWorth / startValue)).toBeCloseTo(1, 6);
        },
      ),
    );
  });

  it('gives a return of 0 to flows without market movement', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }),
        fc.array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 1, maxLength: 30 }),
        (startValue, flows) => {
          let value = startValue;
          const { points } = runDays(
            startPerformance(START, startValue, true),
            flows.map((flow) => {
              value += flow;
              return { flow, end: value, close: 100 };
            }),
          );
          for (const entry of points) {
            expect(entry.index).toBeCloseTo(1, 9);
            expect(entry.benchmarkIndex ?? Number.NaN).toBeCloseTo(1, 9);
            expect(entry.comparison).toBe(entry.netWorth);
            expect(entry.benchmarkValue).toBe(entry.netWorth);
          }
        },
      ),
    );
  });
});

describe('return conventions (E-43)', () => {
  // A player without securities: living costs L and a fixed fee F on the first day of each month,
  // the salary on its last day. A chained day loses at most F / (L + F), because a day end ≥ 0
  // needs a base of at least L + F (TS §7.9 „Kleine Basis“).
  it('gives a player without securities and with constant fees no outlier day', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 50_000, max: 500_000 }),
        fc.integer({ min: 1, max: 3_000 }),
        fc.integer({ min: 0, max: 200_000 }),
        fc.integer({ min: 1, max: 12 }),
        (startValue, livingCosts, fee, surplus, months) => {
          const income = livingCosts + fee + surplus;
          let value = startValue;
          const days: Array<{ flow: number; end: number }> = [];
          for (let month = 0; month < months; month++) {
            value -= livingCosts + fee;
            days.push({ flow: -livingCosts, end: value });
            for (let day = 0; day < 28; day++) {
              days.push({ flow: 0, end: value });
            }
            value += income;
            days.push({ flow: income, end: value });
          }
          const { points } = runDays(startPerformance(START, startValue, false), days);
          let previous = 1;
          for (const entry of points) {
            expect(entry.index / previous - 1).toBeGreaterThanOrEqual(
              -fee / (livingCosts + fee) - 1e-12,
            );
            previous = entry.index;
          }
        },
      ),
    );
  });

  // The shadow portfolio buys and sells only at the close, so with a close every day and units
  // left after every withdrawal its chained return is the index return.
  it('gives the benchmark the index return while it holds units', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            flow: fc.integer({ min: -1_000_000, max: 1_000_000 }),
            close: fc.double({ min: 50, max: 200, noNaN: true }),
          }),
          { minLength: 2, maxLength: 20 },
        ),
        (days) => {
          const { points } = runDays(
            startPerformance(START, 100_000_000, true),
            days.map(({ flow, close }, i) => ({ flow: i === 0 ? 0 : flow, end: 1e9, close })),
          );
          const last = points[points.length - 1];
          expect(last.skippedDays).toBe(0);
          expect(last.benchmarkIndex ?? Number.NaN).toBeCloseTo(
            days[days.length - 1].close / days[0].close,
            9,
          );
        },
      ),
    );
  });
});

describe('benchmark', () => {
  // TS §7.9 table „Benchmark“ (start capital 1.000,00 €); the player's day ends stay positive
  it('buys index units at the closes, waits on days without one and sells for withdrawals', () => {
    const { points } = runDays(startPerformance(START, 100_000, true), [
      { flow: 0, end: 1_000_000, close: 200 },
      { flow: 110_000, end: 1_000_000, close: 220 },
      { flow: 44_000, end: 1_000_000 },
      { flow: 0, end: 1_000_000, close: 231 },
      { flow: -300_000, end: 1_000_000, close: 200 },
      { flow: 0, end: 1_000_000 },
    ]);
    expect(points.map(({ benchmarkValue: value }) => value)).toEqual([
      100_000, 220_000, 264_000, 275_000, -61_905, -61_905,
    ]);
    const indices = [1, 1.1, 1.1, 1.145833333, 0.992063492, 0.992063492];
    points.forEach((entry, i) => expect(entry.benchmarkIndex).toBeCloseTo(indices[i], 8));
    expect(points.map(({ skippedDays }) => skippedDays)).toEqual([0, 0, 0, 0, 0, 1]);
  });

  it('holds the units and the pending flows', () => {
    let benchmark = startPerformance(START, 100_000, true).benchmark;
    if (benchmark === null) {
      throw new Error('benchmark expected');
    }
    expect(benchmarkValue(benchmark)).toBe(100_000);
    benchmark = investAtClose(benchmark, 200);
    expect(benchmark.units).toBeCloseTo(5, 12);
    expect(benchmarkValue(benchmark, 210)).toBeCloseTo(105_000, 6);
    benchmark = investAtClose({ ...benchmark, pending: -200_000 }, 200);
    expect(benchmark.units).toBe(0);
    expect(benchmark.pending).toBeCloseTo(-100_000, 6);
    benchmark = investAtClose({ ...benchmark, pending: benchmark.pending + 140_000 }, 200);
    expect(benchmark.units).toBeCloseTo(2, 12);
    expect(benchmark.pending).toBe(0);
  });

  it('is worth the start capital plus the flows at a constant index level', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -1_000_000, max: 1_000_000 }), { minLength: 1, maxLength: 20 }),
        fc.array(fc.boolean(), { minLength: 20, maxLength: 20 }),
        (flows, closes) => {
          const { points } = runDays(
            startPerformance(START, 100_000, true),
            flows.map((flow, i) => ({ flow, end: 0, close: closes[i] ? 150 : undefined })),
          );
          const last = points[points.length - 1];
          expect(last.benchmarkValue).toBe(last.comparison);
        },
      ),
    );
  });
});

describe('periodReturns', () => {
  it('has no return of the year after a total loss', () => {
    expect(periodReturns(0, 0, 400)).toEqual({ sinceStart: -1, yearToDate: null, annualized: -1 });
  });
});

describe('annualizedReturn', () => {
  // TS §7.9 „Annualisiert“ (act/365)
  it.each([
    [0.1, 730, 0.0488088482],
    [0.1, 365, 0.1],
    [-0.19, 730, -0.1],
    [-1, 400, -1],
  ])('annualises %d over %d days to %d', (total, days, expected) => {
    expect(annualizedReturn(total, days)).toBeCloseTo(expected as number, 9);
  });

  it('leaves periods under a year open', () => {
    expect(annualizedReturn(0.1, 364.99)).toBeNull();
  });
});

describe('performanceFigures', () => {
  // TS §7.9 „Veränderung heute“
  it('shows the change today without the flows of the day', () => {
    const state: PerformanceState = {
      ...startPerformance(START, 100_000, false),
      dayStartValue: 200_000,
      totalFlow: 50_000,
    };
    const figures = performanceFigures(addFlow(state, 110_000), START + TICKS_PER_DAY / 2, {
      cash: 112_200,
      securities: 200_000,
    });
    expect(figures.netWorth).toBe(312_200);
    expect(figures.today).toEqual({ change: 2_200, ratio: expect.any(Number), flow: 110_000 });
    expect(figures.today.ratio).toBeCloseTo(0.0070967742, 9);
    expect(figures.totalFlow).toBe(160_000);
    expect(figures.comparison).toBe(260_000);
    expect(figures.sinceStart).toBe(52_200);
    expect(figures.returns.sinceStart).toBeCloseTo(0.0070967742, 9);
    expect(figures.returns.annualized).toBeNull();
    expect(figures.skippedDays).toBe(0);
    expect(figures.benchmark).toBeNull();
  });

  it('counts today as left out while V_now < 0', () => {
    const state = addFlow(
      { ...startPerformance(START, 100_000, true), dayStartValue: 1_000 },
      -2_000,
    );
    const figures = performanceFigures(state, START, { cash: -1_000, securities: 0 });
    expect(figures.today.ratio).toBeNull();
    expect(figures.today.change).toBe(0);
    expect(figures.skippedDays).toBe(1);
    expect(figures.mostlySkipped).toBe(true);
    expect(figures.returns.sinceStart).toBeNull();
  });

  it('counts today as left out while the benchmark cannot chain it', () => {
    const state: PerformanceState = {
      ...startPerformance(START, 100_000, true),
      day: dayIndex(START) + 400,
      dayStartValue: 100_000,
      index: 1.02,
      skippedDays: 0,
      benchmark: {
        units: 0,
        pending: -40_000,
        close: 200,
        dayStartValue: -40_000,
        index: 1.1,
        yearStartIndex: 1,
      },
    };
    const figures = performanceFigures(state, START + 400 * TICKS_PER_DAY, {
      cash: 101_000,
      securities: 0,
    });
    expect(figures.today.ratio).toBeCloseTo(0.01, 12);
    expect(figures.skippedDays).toBe(1);
    expect(figures.returns.sinceStart).toBeCloseTo(0.02, 12);
  });

  // TS §7.9: from half of the left-out days of a period on its returns show „–“ (E-43)
  it('shows no return since the start from half of the left-out days on', () => {
    const state: PerformanceState = {
      ...startPerformance(START, 100_000, true),
      day: dayOf(2030, 4, 6),
      dayStartValue: 100_000,
      index: 1.02,
    };
    const now = START + 5.5 * TICKS_PER_DAY;
    const values = { cash: 100_000, securities: 0 };
    const shown = performanceFigures({ ...state, skippedDays: 2 }, now, values);
    expect(shown.returns.sinceStart).toBeCloseTo(0.02, 12);
    expect(shown.returns.yearToDate).toBeCloseTo(0.02, 12);
    expect(shown.benchmark?.returns.sinceStart).toBe(0);
    expect(shown.mostlySkipped).toBe(false);
    const hidden = performanceFigures({ ...state, skippedDays: 3 }, now, values);
    expect(hidden.returns).toEqual({ sinceStart: null, yearToDate: null, annualized: null });
    expect(hidden.benchmark?.returns).toEqual({
      sinceStart: null,
      yearToDate: null,
      annualized: null,
    });
    expect(hidden.mostlySkipped).toBe(true);
  });

  it('shows no return of the year from half of its left-out days on', () => {
    const state: PerformanceState = {
      ...startPerformance(START, 100_000, false),
      day: dayOf(2031, 1, 10),
      dayStartValue: 100_000,
      index: 1.05,
      yearStartIndex: 1.04,
      yearStartDay: dayOf(2031, 1, 1),
      yearStartSkippedDays: 1,
    };
    const now = dayStartTick(dayOf(2031, 1, 10)) + TICKS_PER_DAY / 2;
    const values = { cash: 100_000, securities: 0 };
    const shown = performanceFigures({ ...state, skippedDays: 5 }, now, values);
    expect(shown.returns.yearToDate).toBeCloseTo(1.05 / 1.04 - 1, 12);
    const hidden = performanceFigures({ ...state, skippedDays: 6 }, now, values);
    expect(hidden.returns.sinceStart).toBeCloseTo(0.05, 12);
    expect(hidden.returns.yearToDate).toBeNull();
    expect(hidden.mostlySkipped).toBe(true);
  });

  it('values the benchmark at the index level now', () => {
    const start = startPerformance(START, 100_000, true);
    const benchmark = investAtClose(start.benchmark ?? fail(), 200);
    const state = closeDay({ ...start, benchmark }, { cash: 100_000, securities: 0 }).state;
    const figures = performanceFigures(
      state,
      START + 400 * TICKS_PER_DAY,
      {
        cash: 100_000,
        securities: 0,
      },
      220,
    );
    expect(figures.benchmark?.value).toBe(110_000);
    expect(figures.benchmark?.returns.sinceStart).toBeCloseTo(0.1, 9);
    expect(figures.benchmark?.returns.annualized).toBeCloseTo(Math.pow(1.1, 365 / 400) - 1, 9);
  });
});

describe('historyFromDay', () => {
  it.each([
    ['1m', dayOf(2031, 3, 31), dayOf(2031, 2, 28)],
    ['6m', dayOf(2031, 3, 31), dayOf(2030, 9, 30)],
    ['1y', dayOf(2032, 2, 29), dayOf(2031, 2, 28)],
    ['5y', dayOf(2036, 1, 15), dayOf(2031, 1, 15)],
  ] as const)('starts %s back from %d on %d', (range, today, expected) => {
    expect(historyFromDay(range, today)).toBe(expected);
  });

  it('starts the whole game at its start', () => {
    expect(historyFromDay('max', dayOf(2040, 1, 1))).toBeNull();
  });
});

describe('thinPoints', () => {
  const april = Array.from({ length: 10 }, (_, i) => point(dayOf(2030, 4, 1 + i)));

  // TS §8.2 „Tagesreihen“: Mo 01.04.2030 – Mi 10.04.2030
  it.each([
    [10, 'day', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
    [4, 'week', [1, 7, 10]],
    [2, 'month', [1, 10]],
  ] as const)('thins ten days to %d points by %s', (maxPoints, resolution, dates) => {
    const thinned = thinPoints(april, maxPoints);
    expect(thinned.resolution).toBe(resolution);
    expect(thinned.points.map(({ day }) => day)).toEqual(dates.map((date) => dayOf(2030, 4, date)));
  });

  it('keeps the first and the last point, ascending, within the limit', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30_000 }),
        fc.integer({ min: 1, max: 4_000 }),
        fc.integer({ min: 2, max: 500 }),
        (from, count, maxPoints) => {
          const points = Array.from({ length: count }, (_, i) => point(from + i));
          const thinned = thinPoints(points, maxPoints).points;
          expect(thinned.length).toBeLessThanOrEqual(maxPoints);
          expect(thinned[0]).toBe(points[0]);
          expect(thinned[thinned.length - 1]).toBe(points[points.length - 1]);
          for (let i = 1; i < thinned.length; i++) {
            expect(thinned[i].day).toBeGreaterThan(thinned[i - 1].day);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});

function fail(): never {
  throw new Error('benchmark expected');
}
