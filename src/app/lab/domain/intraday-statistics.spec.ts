import { dateTimeToTick, dayIndex, dayStartTick } from '@app/clock/domain/calendar-logic';
import { createCurveTables } from '@app/market/domain/day-curve';
import { DEFAULT_MARKET_CONFIG } from '@app/market/domain/default-market-config';
import { isMarketDay } from '@app/market/domain/market-calendar';
import { createMarketContext } from '@app/market/domain/market-context';
import { createFactorHistory } from '@app/market/domain/market-history';
import { advanceMarket, createMarketState } from '@app/market/domain/market-step';
import { PriceSource } from '@app/market/domain/price-source';
import { indexSeries } from '@app/market/domain/series';
import { END_OF_2020_DAY, GoldenYear, goldenYear } from '@app/market/domain/testing/golden-year';
import { miniWorld } from '@app/world/domain/testing/mini-world';

import {
  computeIntradayStatistics,
  INTRADAY_PARTS,
  intradayWindowStart,
} from './intraday-statistics';
import { IntradayMeasures, IntradayStatistics } from './models/lab-statistics.model';

const DAYS_PER_YEAR = 261;

function day(year: number, month: number, dayOfMonth: number): number {
  return dayIndex(dateTimeToTick({ year, month, day: dayOfMonth }));
}

function middle(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[half] : (sorted[half - 1] + sorted[half]) / 2;
}

/** Brute-force measures of one series over the given days from its minute curves. */
function measuresOf(curves: Float64Array[]): IntradayMeasures {
  let squares = 0;
  let range = 0;
  const sessions: number[] = [];
  for (const curve of curves) {
    for (let j = 1; j < curve.length; j++) {
      squares += Math.log(curve[j] / curve[j - 1]) ** 2;
    }
    range += (Math.max(...curve) - Math.min(...curve)) / curve[0];
    sessions.push(Math.log(curve[curve.length - 1] / curve[0]));
  }
  const n = curves.length;
  const m = sessions.reduce((a, b) => a + b, 0) / n;
  const variance = sessions.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1);
  return {
    minuteVolatility: Math.sqrt((squares / n) * DAYS_PER_YEAR),
    dailyRange: range / n,
    sessionVolatility: Math.sqrt(variance * DAYS_PER_YEAR),
  };
}

function medians(measures: IntradayMeasures[]): IntradayMeasures {
  return {
    minuteVolatility: middle(measures.map((m) => m.minuteVolatility)),
    dailyRange: middle(measures.map((m) => m.dailyRange)),
    sessionVolatility: middle(measures.map((m) => m.sessionVolatility)),
  };
}

describe('intradayWindowStart', () => {
  it('takes the last 63 market days of the period', () => {
    // 63 market days up to Thursday, 31.12.2020 start on Tuesday, 06.10.2020.
    expect(intradayWindowStart(0, day(2021, 1, 1))).toBe(day(2020, 10, 6));
  });

  it('stays inside a shorter period', () => {
    // From Saturday, 19.12.2020: the first market day is Monday, 21.12.2020.
    expect(intradayWindowStart(day(2020, 12, 19), day(2021, 1, 1))).toBe(day(2020, 12, 21));
  });
});

describe('computeIntradayStatistics', () => {
  let golden: GoldenYear;
  let statistics: IntradayStatistics;
  /** Minute curves per share and the world index over the window, from the price source. */
  let shareCurves: Float64Array[][];
  let worldCurves: Float64Array[];

  beforeAll(() => {
    golden = goldenYear();
    let ticks = 0;
    statistics = computeIntradayStatistics(
      golden.tables,
      golden.history,
      golden.world,
      0,
      END_OF_2020_DAY,
      () => ticks++,
    );
    const prices = new PriceSource(golden.context, golden.history, golden.state);
    const worldSeries = indexSeries(
      golden.context,
      golden.world.indices.findIndex((index) => index.kind === 'world'),
    );
    shareCurves = golden.world.companies.map(() => []);
    worldCurves = [];
    for (let d = day(2020, 10, 6); d < END_OF_2020_DAY; d++) {
      if (!isMarketDay(d)) {
        continue;
      }
      golden.world.companies.forEach((_, i) =>
        shareCurves[i].push(prices.minuteCurve(i, d, golden.endOfToday)),
      );
      worldCurves.push(prices.minuteCurve(worldSeries, d, golden.endOfToday));
    }
  });

  it('covers the window and times the minute curves once per day', () => {
    expect(statistics.marketDays).toBe(63);
    expect(statistics.fromTick).toBe(dayStartTick(day(2020, 10, 6)));
    expect(statistics.toTick).toBe(dayStartTick(day(2021, 1, 1)));
    // The clock advances by one per call: one start and one end per day.
    expect(statistics.curvesMs).toBe(63);
  });

  it('measures the shares and the world index from their minute curves', () => {
    const expected = medians(shareCurves.map(measuresOf));
    expect(statistics.stocks.minuteVolatility).toBeCloseTo(expected.minuteVolatility, 12);
    expect(statistics.stocks.dailyRange).toBeCloseTo(expected.dailyRange, 12);
    expect(statistics.stocks.sessionVolatility).toBeCloseTo(expected.sessionVolatility, 12);
    const world = measuresOf(worldCurves);
    expect(statistics.worldIndex.minuteVolatility).toBeCloseTo(world.minuteVolatility, 12);
    expect(statistics.worldIndex.dailyRange).toBeCloseTo(world.dailyRange, 12);
  });

  it('compares the shares of the largest exchange with the reference', () => {
    const counts = new Map<string, number>();
    for (const company of golden.world.companies) {
      counts.set(company.exchangeId, (counts.get(company.exchangeId) ?? 0) + 1);
    }
    const largest = Math.max(...counts.values());
    const { reference } = statistics;
    expect(reference.shares).toBe(largest);
    expect(counts.get(reference.exchangeId)).toBe(largest);
    const group = golden.world.companies.flatMap((company, i) =>
      company.exchangeId === reference.exchangeId ? [shareCurves[i]] : [],
    );
    const expected = medians(group.map(measuresOf));
    expect(reference.bridge.minuteVolatility).toBeCloseTo(expected.minuteVolatility, 12);
    // The reference simulates other paths with the same parameters: same order of magnitude.
    expect(reference.reference.minuteVolatility / expected.minuteVolatility).toBeGreaterThan(0.7);
    expect(reference.reference.minuteVolatility / expected.minuteVolatility).toBeLessThan(1.3);
  });

  it('finds no intraday profile with the uniform default', () => {
    expect(DEFAULT_MARKET_CONFIG.intradayVolProfile).toEqual([1]);
    expect(statistics.profile).toHaveLength(INTRADAY_PARTS);
    expect(statistics.profileRatio).toBeCloseTo(1, 1);
  });

  it('finds the intraday profile of the configuration', () => {
    // Four times the idiosyncratic variance in the first and the last part.
    const profile = Array.from({ length: INTRADAY_PARTS }, (_, p) =>
      p === 0 || p === INTRADAY_PARTS - 1 ? 4 : 1,
    );
    const { seedKey, world } = miniWorld();
    const context = createMarketContext(seedKey, world, {
      ...DEFAULT_MARKET_CONFIG,
      intradayVolProfile: profile,
    });
    const state = createMarketState(context);
    const history = createFactorHistory();
    const toDay = day(2020, 7, 1);
    advanceMarket(context, state, toDay, { history });
    const result = computeIntradayStatistics(createCurveTables(context), history, world, 0, toDay);
    expect(result.profileRatio).toBeGreaterThan(1.3);
    const center = result.profile[6];
    expect(result.profile[0]).toBeGreaterThan(1.3 * center);
    expect(result.profile[INTRADAY_PARTS - 1]).toBeGreaterThan(1.3 * center);
  });

  it('rejects a period without market days', () => {
    // Saturday and Sunday, 19./20.12.2020.
    expect(() =>
      computeIntradayStatistics(
        golden.tables,
        golden.history,
        golden.world,
        day(2020, 12, 19),
        day(2020, 12, 21),
      ),
    ).toThrow(RangeError);
  });
});
