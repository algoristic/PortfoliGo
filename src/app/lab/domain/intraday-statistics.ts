import { mean, median, standardDeviation } from '@app/analysis/domain/statistics-logic';
import { dayStartTick } from '@app/clock/domain/calendar-logic';
import { CurveTables, DayCurves } from '@app/market/domain/day-curve';
import { isMarketDay } from '@app/market/domain/market-calendar';
import { recomputeSupportDays } from '@app/market/domain/market-history';
import { FactorHistory } from '@app/market/domain/models/market-state.model';
import { ReferenceSimulation } from '@app/market/domain/reference-simulation';
import { indexSeries, seriesCount } from '@app/market/domain/series';
import { World } from '@app/world/domain/models/world.model';

import { IntradayMeasures, IntradayStatistics } from './models/lab-statistics.model';

/** Market days at the end of the period that the intraday statistics cover (a quarter). */
export const INTRADAY_MARKET_DAYS = 63;
/** Equally long parts of the trading time for the intraday profile (TS §6.9). */
export const INTRADAY_PARTS = 13;
/** Parts 5–9 (0-based 4–8) are the middle of the trading time. */
const MIDDLE_PARTS = [4, 5, 6, 7, 8];

/** Running measures of the session curves of a group of instruments (one entry each). */
class SessionMeasures {
  readonly #minuteSquares: Float64Array;
  readonly #minutes: Float64Array;
  readonly #partSquares: Float64Array;
  readonly #partMinutes: Float64Array;
  readonly #rangeSum: Float64Array;
  readonly #sessionReturns: number[][];
  #days = 0;

  constructor(count: number) {
    this.#minuteSquares = new Float64Array(count);
    this.#minutes = new Float64Array(count);
    this.#partSquares = new Float64Array(count * INTRADAY_PARTS);
    this.#partMinutes = new Float64Array(count * INTRADAY_PARTS);
    this.#rangeSum = new Float64Array(count);
    this.#sessionReturns = Array.from({ length: count }, () => []);
  }

  /** Adds the session prices of entry n (open to close, `L + 1` values). */
  add(n: number, curve: ArrayLike<number>): void {
    const length = curve.length - 1;
    let high = curve[0];
    let low = curve[0];
    for (let j = 1; j <= length; j++) {
      const r = Math.log(curve[j] / curve[j - 1]);
      // The return of minute j − 1 → j has the weight of minute j − 1 (TS §6.1).
      const part = n * INTRADAY_PARTS + Math.floor(((j - 1) * INTRADAY_PARTS) / length);
      this.#minuteSquares[n] += r * r;
      this.#partSquares[part] += r * r;
      this.#partMinutes[part]++;
      high = Math.max(high, curve[j]);
      low = Math.min(low, curve[j]);
    }
    this.#minutes[n] += length;
    this.#rangeSum[n] += (high - low) / curve[0];
    this.#sessionReturns[n].push(Math.log(curve[length] / curve[0]));
  }

  /** Called once per day after all `add`s of the day. */
  nextDay(): void {
    this.#days++;
  }

  measures(n: number, marketDaysPerYear: number): IntradayMeasures {
    return {
      minuteVolatility: Math.sqrt((this.#minuteSquares[n] / this.#days) * marketDaysPerYear),
      dailyRange: this.#rangeSum[n] / this.#days,
      sessionVolatility:
        this.#days < 2
          ? Number.NaN
          : standardDeviation(this.#sessionReturns[n]) * Math.sqrt(marketDaysPerYear),
    };
  }

  /** Volatility per part relative to the whole session. */
  profile(n: number): number[] {
    const overall = Math.sqrt(this.#minuteSquares[n] / this.#minutes[n]);
    return Array.from({ length: INTRADAY_PARTS }, (_, p) => this.#partVolatility(n, p) / overall);
  }

  /** Mean volatility of the first and the last part ÷ the mean of the middle parts. */
  profileRatio(n: number): number {
    const edges = mean([this.#partVolatility(n, 0), this.#partVolatility(n, INTRADAY_PARTS - 1)]);
    return edges / mean(MIDDLE_PARTS.map((p) => this.#partVolatility(n, p)));
  }

  #partVolatility(n: number, part: number): number {
    const index = n * INTRADAY_PARTS + part;
    return Math.sqrt(this.#partSquares[index] / this.#partMinutes[index]);
  }
}

/** First market day of the intraday window: the last `INTRADAY_MARKET_DAYS` of the period. */
export function intradayWindowStart(fromDay: number, toDay: number): number {
  let start = toDay;
  let marketDays = 0;
  for (let day = toDay - 1; day >= fromDay && marketDays < INTRADAY_MARKET_DAYS; day--) {
    if (isMarketDay(day)) {
      start = day;
      marketDays++;
    }
  }
  return start;
}

/**
 * Intraday statistics over the last market days of `[fromDay, toDay)` (TS §6.9): minute curves of
 * all series (timed with `clock` for the throughput), minute volatility, daily range, session
 * volatility and intraday profile of the shares, and the same measures from the minute-by-minute
 * reference for the shares of the exchange with the most shares (TS §6.1).
 */
export function computeIntradayStatistics(
  tables: CurveTables,
  history: FactorHistory,
  world: World,
  fromDay: number,
  toDay: number,
  clock: () => number = () => 0,
): IntradayStatistics {
  const { context } = tables;
  const marketDaysPerYear = context.config.tradingDaysPerYear;
  const shareCount = context.layout.instrumentIds.length;
  const worldIndex = world.indices.findIndex((index) => index.kind === 'world');
  if (worldIndex < 0) {
    throw new Error('computeIntradayStatistics: the world has no world index');
  }
  const worldSeries = indexSeries(context, worldIndex);
  const allSeries = seriesCount(context);
  const exchangeId = largestExchange(world);
  const group = world.companies.flatMap((company, i) =>
    company.exchangeId === exchangeId ? [i] : [],
  );
  const reference = new ReferenceSimulation(context, group);

  const stocks = new SessionMeasures(shareCount);
  const index = new SessionMeasures(1);
  const referenceMeasures = new SessionMeasures(group.length);
  const curves = new DayCurves(tables);
  const windowStart = intradayWindowStart(fromDay, toDay);
  let firstDay = -1;
  let lastDay = -1;
  let marketDays = 0;
  let curvesMs = 0;

  recomputeSupportDays(context, history, windowStart, toDay, (day, state) => {
    curves.load(day);
    const start = clock();
    for (let s = 0; s < allSeries; s++) {
      curves.seriesCurve(s);
    }
    curvesMs += clock() - start;

    for (let i = 0; i < shareCount; i++) {
      stocks.add(i, curves.instrumentCurve(i));
    }
    index.add(0, curves.seriesCurve(worldSeries));
    reference.simulateDay(day, state.trend).forEach((curve, n) => referenceMeasures.add(n, curve));
    stocks.nextDay();
    index.nextDay();
    referenceMeasures.nextDay();

    if (firstDay < 0) {
      firstDay = day.day;
    }
    lastDay = day.day;
    marketDays++;
  });
  if (marketDays === 0) {
    throw new RangeError('computeIntradayStatistics: the period has no market day');
  }

  const shares = Array.from({ length: shareCount }, (_, i) => i);
  const profiles = shares.map((i) => stocks.profile(i));
  const worldMeasures = index.measures(0, marketDaysPerYear);
  return {
    fromTick: dayStartTick(firstDay),
    toTick: dayStartTick(lastDay + 1),
    marketDays,
    stocks: medianMeasures(shares.map((i) => stocks.measures(i, marketDaysPerYear))),
    worldIndex: {
      minuteVolatility: worldMeasures.minuteVolatility,
      dailyRange: worldMeasures.dailyRange,
    },
    reference: {
      exchangeId,
      shares: group.length,
      bridge: medianMeasures(group.map((i) => stocks.measures(i, marketDaysPerYear))),
      reference: medianMeasures(
        group.map((_, n) => referenceMeasures.measures(n, marketDaysPerYear)),
      ),
    },
    profile: Array.from({ length: INTRADAY_PARTS }, (_, p) =>
      median(profiles.map((profile) => profile[p])),
    ),
    profileRatio: median(shares.map((i) => stocks.profileRatio(i))),
    curvesMs,
  };
}

/** Exchange with the most shares; on a tie the one whose first share comes first. */
function largestExchange(world: World): string {
  const counts = new Map<string, number>();
  for (const company of world.companies) {
    counts.set(company.exchangeId, (counts.get(company.exchangeId) ?? 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [exchangeId, count] of counts) {
    if (count > bestCount) {
      best = exchangeId;
      bestCount = count;
    }
  }
  return best;
}

function medianMeasures(measures: IntradayMeasures[]): IntradayMeasures {
  return {
    minuteVolatility: median(measures.map((m) => m.minuteVolatility)),
    dailyRange: median(measures.map((m) => m.dailyRange)),
    sessionVolatility: median(measures.map((m) => m.sessionVolatility)),
  };
}
