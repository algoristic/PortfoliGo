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
 * Return of a day with the external flows at its start (TS §7.9): `V_end / (V_start + CF) − 1`.
 * `null` when `V_start + CF ≤ 0`: the day is left out of the chain. A day end below 0 counts as
 * −100 % (the factor never turns negative).
 */
export function dailyReturn(start: number, flow: number, end: number): number | null {
  const base = start + flow;
  if (!(base > 0)) {
    return null;
  }
  return Math.max(end / base, 0) - 1;
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

/** Returns since the start, since the year start and annualised from chained growth factors. */
export function periodReturns(index: number, yearStartIndex: number, days: number): PeriodReturns {
  const sinceStart = index - 1;
  return {
    sinceStart,
    yearToDate: yearStartIndex > 0 ? index / yearStartIndex - 1 : null,
    annualized: annualizedReturn(sinceStart, days),
  };
}

/** Performance at the start of a game: the start capital is the value at the start, not a flow. */
export function startPerformance(
  tick: Tick,
  startValue: Cents,
  withBenchmark: boolean,
): PerformanceState {
  return {
    startTick: tick,
    startValue,
    day: dayIndex(tick),
    dayStartValue: startValue,
    dayFlow: 0,
    totalFlow: 0,
    index: 1,
    skippedDays: 0,
    yearStartIndex: 1,
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

/** Adds an external flow to the running day; the benchmark invests it at the next close. */
export function addFlow(state: PerformanceState, flow: Cents): PerformanceState {
  if (flow === 0) {
    return state;
  }
  const { benchmark } = state;
  return {
    ...state,
    dayFlow: state.dayFlow + flow,
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

function closeBenchmarkDay(
  benchmark: BenchmarkState,
  flow: Cents,
  newYear: boolean,
): BenchmarkState {
  const end = benchmarkValue(benchmark);
  const r = dailyReturn(benchmark.dayStartValue, flow, end);
  const index = r === null ? benchmark.index : benchmark.index * (1 + r);
  return {
    ...benchmark,
    dayStartValue: end,
    index,
    yearStartIndex: newYear ? index : benchmark.yearStartIndex,
  };
}

/**
 * Ends the running day with the values at its end (TS §3.8 step 4, §7.9): chains its return, adds
 * its flows and starts the next day. The point is the day of the daily series.
 */
export function closeDay(
  state: PerformanceState,
  end: PortfolioValues,
): { state: PerformanceState; point: DailyPoint } {
  const netWorth = end.cash + end.securities;
  const r = dailyReturn(state.dayStartValue, state.dayFlow, netWorth);
  const index = r === null ? state.index : state.index * (1 + r);
  const skippedDays = state.skippedDays + (r === null ? 1 : 0);
  const totalFlow = state.totalFlow + state.dayFlow;
  const nextDay = state.day + 1;
  const newYear = yearOfDay(nextDay) !== yearOfDay(state.day);
  const benchmark =
    state.benchmark === null ? null : closeBenchmarkDay(state.benchmark, state.dayFlow, newYear);
  return {
    state: {
      ...state,
      day: nextDay,
      dayStartValue: netWorth,
      dayFlow: 0,
      totalFlow,
      index,
      skippedDays,
      yearStartIndex: newYear ? index : state.yearStartIndex,
      benchmark,
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
      benchmarkValue: benchmark === null ? null : roundHalfAwayFromZero(benchmark.dayStartValue),
      benchmarkIndex: benchmark?.index ?? null,
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
  const r = dailyReturn(state.dayStartValue, state.dayFlow, netWorth);
  const index = r === null ? state.index : state.index * (1 + r);
  const totalFlow = state.totalFlow + state.dayFlow;
  const comparison = state.startValue + totalFlow;
  const days = (tick - state.startTick) / TICKS_PER_DAY;
  const { benchmark } = state;
  let benchmarkFigures: PerformanceFigures['benchmark'] = null;
  if (benchmark !== null) {
    const value = benchmarkValue(benchmark, benchmarkPrice);
    const rb = dailyReturn(benchmark.dayStartValue, state.dayFlow, value);
    const benchmarkIndex = rb === null ? benchmark.index : benchmark.index * (1 + rb);
    benchmarkFigures = {
      value: roundHalfAwayFromZero(value),
      returns: periodReturns(benchmarkIndex, benchmark.yearStartIndex, days),
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
    returns: periodReturns(index, state.yearStartIndex, days),
    skippedDays: state.skippedDays + (r === null ? 1 : 0),
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
