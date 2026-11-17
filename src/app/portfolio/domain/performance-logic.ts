import { EMPLOYER_ACCOUNT, LIVING_COSTS_ACCOUNT } from '@app/banking/domain/ledger-logic';
import { PostingDraft } from '@app/banking/domain/models/ledger.model';
import {
  dayIndex,
  dayStartTick,
  tickToDateTime,
  weekdayOfDay,
} from '@app/clock/domain/calendar-logic';
import { Tick, TICKS_PER_DAY } from '@app/clock/domain/models/time.model';
import { monthsBackDay } from '@app/market/domain/performance-logic';
import { Cents, CENTS_PER_EURO } from '@app/shared/domain/models/money.model';
import { roundHalfAwayFromZero } from '@app/shared/domain/money-logic';
import { detExp, detLog } from '@app/simulation/util/det-math';

import {
  BenchmarkState,
  DailyPoint,
  HistoryRange,
  PerformanceFigures,
  PerformanceState,
  PeriodReturns,
  PortfolioValues,
  SeriesResolution,
  ThinnedSeries,
} from './models/performance.model';

/** Calendar days of a year for annualising (act/365, TS §7.9). */
export const DAYS_PER_YEAR = 365;

/** Default and upper limit of the points of a thinned daily series (TS §8.2). */
export const DEFAULT_HISTORY_POINTS = 400;
export const MAX_HISTORY_POINTS = 2_000;

/** Calendar months back per chart period; `max` starts at the start of the game. */
export const HISTORY_RANGE_MONTHS: Readonly<Record<HistoryRange, number | null>> = {
  '1m': 1,
  '6m': 6,
  '1y': 12,
  '5y': 60,
  max: null,
};

/**
 * External flow of a transaction (TS §7.9): income − living costs, i.e. what the postings on
 * `external:employer` and `external:living-costs` move into the player's books. Interest, fees,
 * taxes, payouts, trades and the opening balance are not external flows.
 */
export function externalFlow(postings: readonly PostingDraft[]): Cents {
  let flow = 0;
  for (const { account, amount } of postings) {
    if (account === EMPLOYER_ACCOUNT || account === LIVING_COSTS_ACCOUNT) {
      flow -= amount;
    }
  }
  return flow;
}

/**
 * Share of left-out days from which the returns of a period show „–“ (E-43): from half of its
 * days on, the chained days no longer describe the period.
 */
export const MAX_SKIPPED_SHARE = 0.5;

/**
 * Return of a day (TS §7.9, E-43): inflows at its start, outflows at its end,
 * `(V_end − CF⁻) / (V_start + CF⁺) − 1` with `outflow` = `CF⁻ ≤ 0`. Fixed costs on the day of the
 * living costs thus meet the value before them, not a base near 0. `null` (left out of the chain)
 * when `V_start + CF⁺ ≤ 0` or `V_end < 0`; the factor is then never negative.
 */
export function dailyReturn(
  start: number,
  inflow: number,
  outflow: number,
  end: number,
): number | null {
  const base = start + inflow;
  if (!(base > 0) || end < 0) {
    return null;
  }
  return (end - outflow) / base - 1;
}

/**
 * Return of a benchmark day (TS §7.9, E-43): all flows at its end, `(B_end − CF) / B_start − 1`,
 * because the shadow portfolio buys and sells only at the close. `null` when `B_start ≤ 0` (no
 * units, a negative cash amount) or `B_end − CF < 0` (a waiting withdrawal larger than the units).
 */
export function benchmarkReturn(start: number, flow: number, end: number): number | null {
  const value = end - flow;
  if (!(start > 0) || value < 0) {
    return null;
  }
  return value / start - 1;
}

/** Whether `skipped` of `days` days (≥ 1) are too many for a return of the period (E-43). */
export function isMostlySkipped(skipped: number, days: number): boolean {
  return skipped >= days * MAX_SKIPPED_SHARE;
}

/** Annualised return over `days` calendar days (act/365); `null` before a full year. */
export function annualizedReturn(total: number, days: number): number | null {
  if (!(days >= DAYS_PER_YEAR)) {
    return null;
  }
  const growth = 1 + total;
  if (growth <= 0) {
    return -1;
  }
  return detExp((detLog(growth) * DAYS_PER_YEAR) / days) - 1;
}

/** Periods whose returns show „–“ because at least half of their days were left out (E-43). */
export interface SkippedPeriods {
  sinceStart: boolean;
  yearToDate: boolean;
}

const NOTHING_SKIPPED: SkippedPeriods = { sinceStart: false, yearToDate: false };

/**
 * Returns since the start, since the year start and annualised from chained growth factors; a
 * period in `skipped` has none.
 */
export function periodReturns(
  index: number,
  yearStartIndex: number,
  days: number,
  skipped: SkippedPeriods = NOTHING_SKIPPED,
): PeriodReturns {
  const sinceStart = index - 1;
  return {
    sinceStart: skipped.sinceStart ? null : sinceStart,
    yearToDate: skipped.yearToDate || !(yearStartIndex > 0) ? null : index / yearStartIndex - 1,
    annualized: skipped.sinceStart ? null : annualizedReturn(sinceStart, days),
  };
}

/** Performance at the start of a game: the start capital is the value at the start, not a flow. */
export function startPerformance(
  tick: Tick,
  startValue: Cents,
  withBenchmark: boolean,
): PerformanceState {
  const day = dayIndex(tick);
  return {
    startTick: tick,
    startValue,
    day,
    dayStartValue: startValue,
    dayFlow: 0,
    dayOutflow: 0,
    totalFlow: 0,
    index: 1,
    skippedDays: 0,
    yearStartIndex: 1,
    yearStartDay: day,
    yearStartSkippedDays: 0,
    benchmark: withBenchmark
      ? {
          units: 0,
          pending: startValue,
          close: null,
          dayStartValue: startValue,
          index: 1,
          yearStartIndex: 1,
        }
      : null,
  };
}

/**
 * Adds the external flow of a transaction to the running day: an inflow counts at the start of the
 * day, an outflow at its end (E-43). The benchmark invests it at the next close.
 */
export function addFlow(state: PerformanceState, flow: Cents): PerformanceState {
  if (flow === 0) {
    return state;
  }
  const { benchmark } = state;
  return {
    ...state,
    dayFlow: state.dayFlow + flow,
    dayOutflow: flow < 0 ? state.dayOutflow + flow : state.dayOutflow,
    benchmark: benchmark === null ? null : { ...benchmark, pending: benchmark.pending + flow },
  };
}

/** Value of the benchmark in cents at the index level `price` (the last close without one). */
export function benchmarkValue(benchmark: BenchmarkState, price: number | null = null): number {
  const level = price ?? benchmark.close;
  return level === null
    ? benchmark.pending
    : benchmark.units * level * CENTS_PER_EURO + benchmark.pending;
}

/**
 * The benchmark at a close of the world performance index (TS §7.9): the waiting flows buy units
 * at `close`, negative ones sell units. It never holds fewer than 0 units: what a withdrawal takes
 * beyond its value stays as a negative cash amount (without interest) that later inflows settle
 * before new units are bought.
 */
export function investAtClose(benchmark: BenchmarkState, close: number): BenchmarkState {
  const price = close * CENTS_PER_EURO;
  const units = benchmark.units + benchmark.pending / price;
  return units >= 0
    ? { ...benchmark, units, pending: 0, close }
    : { ...benchmark, units: 0, pending: units * price, close };
}

function yearOfDay(day: number): number {
  return tickToDateTime(dayStartTick(day)).year;
}

/** Return of the running day so far, `null` when it is left out (TS §7.9, E-43). */
function playerReturn(state: PerformanceState, end: number): number | null {
  return dailyReturn(state.dayStartValue, state.dayFlow - state.dayOutflow, state.dayOutflow, end);
}

/**
 * Ends the running day with the values at its end (TS §3.8 step 4, §7.9): chains its return, adds
 * its flows and starts the next day. A day that the player's or the benchmark's return cannot
 * chain is left out of both (E-43). The point is the day of the daily series.
 */
export function closeDay(
  state: PerformanceState,
  end: PortfolioValues,
): { state: PerformanceState; point: DailyPoint } {
  const netWorth = end.cash + end.securities;
  const { benchmark } = state;
  const r = playerReturn(state, netWorth);
  const benchmarkEnd = benchmark === null ? 0 : benchmarkValue(benchmark);
  const rb =
    benchmark === null ? 0 : benchmarkReturn(benchmark.dayStartValue, state.dayFlow, benchmarkEnd);
  const skipped = r === null || rb === null;
  const index = skipped ? state.index : state.index * (1 + r);
  const skippedDays = state.skippedDays + (skipped ? 1 : 0);
  const totalFlow = state.totalFlow + state.dayFlow;
  const nextDay = state.day + 1;
  const newYear = yearOfDay(nextDay) !== yearOfDay(state.day);
  let nextBenchmark: BenchmarkState | null = null;
  if (benchmark !== null) {
    const benchmarkIndex = skipped ? benchmark.index : benchmark.index * (1 + rb);
    nextBenchmark = {
      ...benchmark,
      dayStartValue: benchmarkEnd,
      index: benchmarkIndex,
      yearStartIndex: newYear ? benchmarkIndex : benchmark.yearStartIndex,
    };
  }
  return {
    state: {
      ...state,
      day: nextDay,
      dayStartValue: netWorth,
      dayFlow: 0,
      dayOutflow: 0,
      totalFlow,
      index,
      skippedDays,
      yearStartIndex: newYear ? index : state.yearStartIndex,
      yearStartDay: newYear ? nextDay : state.yearStartDay,
      yearStartSkippedDays: newYear ? skippedDays : state.yearStartSkippedDays,
      benchmark: nextBenchmark,
    },
    point: {
      day: state.day,
      tick: dayStartTick(nextDay),
      netWorth,
      cash: end.cash,
      securities: end.securities,
      flow: state.dayFlow,
      totalFlow,
      comparison: state.startValue + totalFlow,
      index,
      skippedDays,
      benchmarkValue: nextBenchmark === null ? null : roundHalfAwayFromZero(benchmarkEnd),
      benchmarkIndex: nextBenchmark?.index ?? null,
    },
  };
}

/**
 * Live figures at `tick` (US-PF-01, US-PF-05): the running day is chained as if it ended now.
 * „Veränderung heute“ leaves out today's external flows; the change since the start leaves out
 * all of them (`netWorth − comparison`). `benchmarkPrice` is the index level now, `null` for the
 * last close.
 */
export function performanceFigures(
  state: PerformanceState,
  tick: Tick,
  now: PortfolioValues,
  benchmarkPrice: number | null = null,
): PerformanceFigures {
  const netWorth = now.cash + now.securities;
  const { benchmark } = state;
  const r = playerReturn(state, netWorth);
  const benchmarkNow = benchmark === null ? 0 : benchmarkValue(benchmark, benchmarkPrice);
  const rb =
    benchmark === null ? 0 : benchmarkReturn(benchmark.dayStartValue, state.dayFlow, benchmarkNow);
  const todaySkipped = r === null || rb === null;
  const index = todaySkipped ? state.index : state.index * (1 + r);
  const totalFlow = state.totalFlow + state.dayFlow;
  const comparison = state.startValue + totalFlow;
  const days = (tick - state.startTick) / TICKS_PER_DAY;
  const skippedDays = state.skippedDays + (todaySkipped ? 1 : 0);
  const skipped: SkippedPeriods = {
    sinceStart: isMostlySkipped(skippedDays, state.day - dayIndex(state.startTick) + 1),
    yearToDate: isMostlySkipped(
      skippedDays - state.yearStartSkippedDays,
      state.day - state.yearStartDay + 1,
    ),
  };
  let benchmarkFigures: PerformanceFigures['benchmark'] = null;
  if (benchmark !== null) {
    const benchmarkIndex = todaySkipped ? benchmark.index : benchmark.index * (1 + rb);
    benchmarkFigures = {
      value: roundHalfAwayFromZero(benchmarkNow),
      returns: periodReturns(benchmarkIndex, benchmark.yearStartIndex, days, skipped),
    };
  }
  return {
    tick,
    startTick: state.startTick,
    startValue: state.startValue,
    netWorth,
    cash: now.cash,
    securities: now.securities,
    totalFlow,
    comparison,
    sinceStart: netWorth - comparison,
    today: {
      change: netWorth - state.dayStartValue - state.dayFlow,
      ratio: r,
      flow: state.dayFlow,
    },
    returns: periodReturns(index, state.yearStartIndex, days, skipped),
    skippedDays,
    mostlySkipped: skipped.sinceStart || skipped.yearToDate,
    benchmark: benchmarkFigures,
  };
}

/** First day of a chart period ending on `today`; `null` for the whole game (`max`). */
export function historyFromDay(range: HistoryRange, today: number): number | null {
  const months = HISTORY_RANGE_MONTHS[range];
  return months === null ? null : monthsBackDay(today, months);
}

function bucketOf(day: number, resolution: SeriesResolution): number {
  switch (resolution) {
    case 'day':
      return day;
    case 'week':
      return day - weekdayOfDay(day);
    case 'month': {
      const { year, month } = tickToDateTime(dayStartTick(day));
      return year * 12 + month;
    }
    case 'year':
      return yearOfDay(day);
  }
}

function lastOfBuckets(points: readonly DailyPoint[], resolution: SeriesResolution): DailyPoint[] {
  const result: DailyPoint[] = [];
  points.forEach((point, i) => {
    const next = points[i + 1];
    if (next === undefined || bucketOf(next.day, resolution) !== bucketOf(point.day, resolution)) {
      result.push(point);
    }
  });
  return result;
}

/**
 * Thins a daily series (ascending by day) to at most `maxPoints` points (TS §8.2): the first point
 * and the last point of each day, week (Monday to Sunday), month or year, the finest resolution
 * that fits. The cumulative fields keep every period computable. A series that does not fit even
 * by years keeps the first point and the last `maxPoints − 1` year ends.
 */
export function thinPoints(points: readonly DailyPoint[], maxPoints: number): ThinnedSeries {
  const limit = Math.max(2, Math.floor(maxPoints));
  if (points.length <= limit) {
    return { points: points.slice(), resolution: 'day' };
  }
  const [first, ...rest] = points;
  let resolution: SeriesResolution = 'week';
  let ends = lastOfBuckets(rest, resolution);
  for (const coarser of ['month', 'year'] as const) {
    if (ends.length + 1 <= limit) {
      break;
    }
    resolution = coarser;
    ends = lastOfBuckets(rest, coarser);
  }
  return { points: [first, ...ends.slice(-(limit - 1))], resolution };
}
