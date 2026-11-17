import { dayStartTick } from '@app/clock/domain/calendar-logic';
import { isMarketDay } from '@app/market/domain/market-calendar';
import { World } from '@app/world/domain/models/world.model';

import { computeLabStatistics, phaseSegments, premiumMeasures } from './lab-statistics';
import { MarketSample } from './market-sample';
import { IntradayStatistics, LabStatistics } from './models/lab-statistics.model';

const DAYS_PER_YEAR = 261;

/** Four shares: a and b same region and sector, c same region other sector, d other region. */
const world = {
  sectors: [{ id: 'tech' }, { id: 'energy' }],
  companies: [
    { size: 'large', sectorId: 'tech', regionId: 'europe' },
    { size: 'large', sectorId: 'tech', regionId: 'europe' },
    { size: 'small', sectorId: 'energy', regionId: 'europe' },
    { size: 'mid', sectorId: 'energy', regionId: 'north-america' },
  ],
} as unknown as World;

function marketDays(count: number): Int32Array {
  const days: number[] = [];
  for (let day = 0; days.length < count; day++) {
    if (isMarketDay(day)) {
      days.push(day);
    }
  }
  return Int32Array.from(days);
}

/** Daily log return of the world price index; it alternates between +A and −A. */
const A = 0.01;
/** Daily log return of the shares a and b (c has the opposite sign); it alternates as well. */
const B = 0.012;
/** Yearly dividend yield of the world index: the total return index grows by it on top. */
const YIELD = 0.02;

/**
 * Sample standard deviation of `n` returns alternating between +r and −r (`n` even, so the mean
 * is 0), scaled to a year: r · √(n / (n − 1)) · √days per year. Independent of `statistics-logic`.
 */
function alternatingVolatility(r: number, n: number): number {
  return r * Math.sqrt(n / (n - 1)) * Math.sqrt(DAYS_PER_YEAR);
}

function sample(count: number): MarketSample {
  const days = marketDays(count);
  const base = Float32Array.from({ length: count - 1 }, (_, d) => (d % 2 === 0 ? B : -B));
  const other = Float32Array.from({ length: count - 1 }, (_, d) => 0.02 * Math.cos(d * 0.9));
  const worldPrice = new Float64Array(count);
  const worldTotalReturn = new Float64Array(count);
  for (let d = 0; d < count; d++) {
    worldPrice[d] = 100 * Math.exp(A * (d % 2));
    worldTotalReturn[d] = worldPrice[d] * Math.exp(YIELD * (d / DAYS_PER_YEAR));
  }
  return {
    days,
    phases: Uint8Array.from({ length: count }, (_, d) => (d < count / 2 ? 0 : 3)),
    worldPrice,
    worldTotalReturn,
    stockReturns: [base, base, base.map((r) => -r), other],
    dividendSum: Float64Array.from([4, 0, 2, 1]),
    closeSum: Float64Array.from([100, 100, 50, 50]).map((close) => close * count),
    overnight: {
      world: 0.1,
      regions: { 'north-america': 0.2, europe: 0.3, 'asia-pacific': 0.5, 'emerging-markets': 0.6 },
      stocks: 0.3,
    },
    checkpoints: [],
    regionPrices: [],
    yearly: [],
    maxPrice: 321,
  };
}

/** Closes with a trend and two waves, so that weekly and monthly returns vary. */
function wavyCloses(count: number, scale = 100): Float64Array {
  return Float64Array.from(
    { length: count },
    (_, d) => scale * Math.exp(0.0003 * d + 0.02 * Math.sin(d * 0.7) + 0.03 * Math.cos(d * 0.05)),
  );
}

/** Calendar of a day for the oracles, through `Date` instead of the game calendar. */
function utcDate(day: number): Date {
  return new Date(Date.UTC(2020, 0, 1) + dayStartTick(day) * 60_000);
}

/**
 * Brute-force volatility p. a. of the log returns between the last closes of each period, with
 * the sample standard deviation written out (independent of `statistics-logic`).
 */
function periodVolatilityOracle(
  days: Int32Array,
  closes: Float64Array,
  periodOf: (date: Date) => number,
  periodsPerYear: number,
): number {
  const ends: number[] = [];
  for (let d = 0; d < days.length; d++) {
    if (d === days.length - 1 || periodOf(utcDate(days[d + 1])) !== periodOf(utcDate(days[d]))) {
      ends.push(closes[d]);
    }
  }
  const returns = ends.slice(1).map((close, i) => Math.log(close / ends[i]));
  const m = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - m) * (r - m), 0) / (returns.length - 1);
  return Math.sqrt(variance * periodsPerYear);
}

/** Intraday part: computed from minute curves elsewhere, passed through unchanged. */
const intraday = { profileRatio: 1.4 } as IntradayStatistics;

describe('lab-statistics', () => {
  describe('phaseSegments', () => {
    it('joins consecutive market days of the same phase', () => {
      expect(phaseSegments([0, 1, 2, 5, 6], [1, 1, 0, 0, 3])).toEqual([
        { phase: 'normal', fromTick: dayStartTick(0), toTick: dayStartTick(2), marketDays: 2 },
        { phase: 'boom', fromTick: dayStartTick(2), toTick: dayStartTick(6), marketDays: 2 },
        { phase: 'crisis', fromTick: dayStartTick(6), toTick: dayStartTick(7), marketDays: 1 },
      ]);
    });
  });

  describe('computeLabStatistics', () => {
    // Two years of returns: an even number, so alternating returns have the mean 0.
    const count = 2 * DAYS_PER_YEAR + 1;
    let input: MarketSample;
    let statistics: LabStatistics;
    const value = (id: string): number | undefined =>
      statistics.targets.find((row) => row.id === id)?.value;

    beforeAll(() => {
      input = sample(count);
      statistics = computeLabStatistics(input, intraday, world, 'epoch', DAYS_PER_YEAR);
    });

    it('measures the period in market days', () => {
      expect(statistics.marketDays).toBe(count);
      expect(statistics.years).toBeCloseTo(count / DAYS_PER_YEAR, 12);
      expect(statistics.fromTick).toBe(dayStartTick(input.days[0]));
      expect(statistics.toTick).toBe(dayStartTick(input.days[count - 1] + 1));
    });

    it('measures returns, volatility and dividend yield of the world index', () => {
      // The price index ends where it started; the total return index adds the yield.
      expect(value('world-volatility')).toBeCloseTo(alternatingVolatility(A, count - 1), 12);
      expect(value('world-price-return')).toBeCloseTo(0, 12);
      expect(value('world-return')).toBeCloseTo(Math.exp(YIELD) - 1, 12);
      expect(value('world-dividend-yield')).toBeCloseTo(YIELD, 12);
    });

    it('correlates only shares of the same region on daily returns', () => {
      expect(value('correlation-within-all')).toBeCloseTo(1, 6);
      expect(value('correlation-between-all')).toBeCloseTo(-1, 6);
      expect(statistics.correlations.sectorIds).toEqual(['tech', 'energy']);
      expect(statistics.correlations.values[0][0]).toBeCloseTo(1, 6);
      expect(statistics.correlations.values[0][1]).toBeCloseTo(-1, 6);
      expect(statistics.correlations.values[1][0]).toBeCloseTo(-1, 6);
      expect(statistics.correlations.values[1][1]).toBeNaN();
    });

    it('includes pairs of all regions in the weekly correlation', () => {
      expect(value('weekly-correlation-within')).toBeLessThan(1);
      expect(Number.isFinite(value('weekly-correlation-between'))).toBe(true);
    });

    it('takes medians of the share volatility per size class', () => {
      const large = statistics.sizeVolatility.find((entry) => entry.size === 'large');
      // The returns are stored as float32, so the oracle uses the float32 value of B.
      const expected = alternatingVolatility(Math.fround(B), count - 1);
      expect(large?.count).toBe(2);
      expect(large?.median).toBeCloseTo(expected, 12);
      expect(value('large-volatility')).toBeCloseTo(expected, 12);
      expect(value('small-volatility')).toBeCloseTo(expected, 12);
    });

    it('relates realized dividends to the mean close per year', () => {
      expect(value('stock-dividend-yield-max')).toBeCloseTo(4 / 100 / statistics.years, 12);
    });

    it('counts phase shares and marks targets that need longer periods', () => {
      expect(statistics.phaseShares.map((share) => share.phase)).toEqual([
        'boom',
        'normal',
        'downturn',
        'crisis',
      ]);
      expect(statistics.phaseShares[0].share + statistics.phaseShares[3].share).toBe(1);
      expect(statistics.targets.find((row) => row.id === 'world-return')?.status).toBe('short');
      for (const id of ['overnight-share-world', 'overnight-share-emerging-markets']) {
        expect(statistics.targets.find((row) => row.id === id)?.status).toBe('info');
      }
    });

    it('takes the overnight shares from the sample and the profile from the intraday part', () => {
      expect(value('overnight-share-world')).toBe(0.1);
      expect(value('overnight-share-north-america')).toBe(0.2);
      expect(value('overnight-share-europe')).toBe(0.3);
      expect(value('overnight-share-asia-pacific')).toBe(0.5);
      expect(value('overnight-share-emerging-markets')).toBe(0.6);
      expect(value('overnight-share-stocks')).toBe(0.3);
      expect(value('intraday-profile')).toBe(1.4);
      expect(statistics.intraday).toBe(intraday);
    });

    it('standardizes the return distribution', () => {
      const { counts, normal, outside } = statistics.distribution;
      expect(counts.reduce((a, b) => a + b, 0) + outside).toBe(count - 1);
      expect(normal.reduce((a, b) => a + b, 0)).toBeCloseTo(count - 1, -1);
    });

    it('lists drawdown episodes of the world total return index', () => {
      const drawdown = sample(count);
      drawdown.worldTotalReturn = Float64Array.from({ length: count }, (_, d) =>
        d < 100 ? 100 : d < 200 ? 70 : 110,
      );
      const result = computeLabStatistics(drawdown, intraday, world, 'epoch', DAYS_PER_YEAR);
      expect(result.maxDrawdown).toBeCloseTo(0.3, 12);
      expect(result.drawdowns).toEqual([
        {
          peakTick: dayStartTick(drawdown.days[99]),
          troughTick: dayStartTick(drawdown.days[100]),
          recoveryTick: dayStartTick(drawdown.days[200]),
          depth: expect.closeTo(0.3, 12),
        },
      ]);
    });

    it('rejects periods without returns', () => {
      expect(() =>
        computeLabStatistics(sample(1), intraday, world, 'epoch', DAYS_PER_YEAR),
      ).toThrow(RangeError);
    });
  });

  describe('correlation targets over large caps (E-31)', () => {
    // a, b: large tech Europe; c: large energy Europe (opposite returns); e: small tech Europe and
    // g: large energy North America, both with unrelated returns.
    const largeWorld = {
      sectors: [{ id: 'tech' }, { id: 'energy' }],
      companies: [
        { size: 'large', sectorId: 'tech', regionId: 'europe' },
        { size: 'large', sectorId: 'tech', regionId: 'europe' },
        { size: 'large', sectorId: 'energy', regionId: 'europe' },
        { size: 'small', sectorId: 'tech', regionId: 'europe' },
        { size: 'large', sectorId: 'energy', regionId: 'north-america' },
      ],
    } as unknown as World;
    let statistics: LabStatistics;
    const value = (id: string): number | undefined =>
      statistics.targets.find((row) => row.id === id)?.value;

    beforeAll(() => {
      const count = 2 * DAYS_PER_YEAR + 1;
      const base = sample(count);
      const [a, , c, other] = base.stockReturns;
      const unrelated = Float32Array.from(other, (_, d) => 0.015 * Math.sin(d * 1.7));
      const input: MarketSample = {
        ...base,
        stockReturns: [a, a, c, other, unrelated],
        dividendSum: new Float64Array(5),
        closeSum: new Float64Array(5).fill(100 * count),
      };
      statistics = computeLabStatistics(input, intraday, largeWorld, 'epoch', DAYS_PER_YEAR);
    });

    it('takes the targets only from large caps of the same region', () => {
      expect(value('correlation-within')).toBeCloseTo(1, 6);
      expect(value('correlation-between')).toBeCloseTo(-1, 6);
    });

    it('keeps all pairs of the same region for information', () => {
      expect(value('correlation-within-all')).toBeLessThan(0.9);
      expect(value('correlation-between-all')).toBeGreaterThan(-0.9);
      expect(statistics.targets.find((row) => row.id === 'correlation-within-all')?.status).toBe(
        'info',
      );
    });
  });
  describe('info rows of AP 7.3a (TS §6.9)', () => {
    const count = 3 * DAYS_PER_YEAR + 1;
    let input: MarketSample;
    let statistics: LabStatistics;
    const value = (id: string): number | undefined =>
      statistics.targets.find((row) => row.id === id)?.value;

    beforeAll(() => {
      input = sample(count);
      input.worldPrice = wavyCloses(count);
      const europe = wavyCloses(count, 50);
      input.regionPrices = [
        { regionId: 'europe', closes: europe },
        // Twice the European index: the same returns, so a correlation of exactly 1.
        { regionId: 'asia-pacific', closes: europe.map((close) => 2 * close) },
      ];
      statistics = computeLabStatistics(input, intraday, world, 'epoch', DAYS_PER_YEAR);
    });

    it('measures the world volatility on weekly and monthly returns', () => {
      const mondayOf = (date: Date): number =>
        Math.floor(date.getTime() / 86_400_000) - ((date.getUTCDay() + 6) % 7);
      const monthOf = (date: Date): number => date.getUTCFullYear() * 12 + date.getUTCMonth();
      expect(value('world-volatility-weekly')).toBeCloseTo(
        periodVolatilityOracle(input.days, input.worldPrice, mondayOf, DAYS_PER_YEAR / 5),
        12,
      );
      expect(value('world-volatility-monthly')).toBeCloseTo(
        periodVolatilityOracle(input.days, input.worldPrice, monthOf, 12),
        12,
      );
    });

    it('takes medians over the regional indices and correlates their monthly returns', () => {
      expect(value('region-correlation')).toBeCloseTo(1, 12);
      const europe = computeLabStatistics(
        { ...input, worldPrice: input.regionPrices[0].closes },
        intraday,
        world,
        'epoch',
        DAYS_PER_YEAR,
      );
      const world0 = (id: string): number | undefined =>
        europe.targets.find((row) => row.id === id)?.value;
      // Scaling an index changes neither its volatility nor its drawdown.
      expect(value('region-volatility')).toBeCloseTo(world0('world-volatility') ?? NaN, 12);
      expect(value('region-max-drawdown')).toBeGreaterThan(0);
    });

    it('measures the drawdowns of the world total return index', () => {
      // The total return index of `sample` alternates: below the high on every second day.
      expect(value('world-max-drawdown')).toBeCloseTo(statistics.maxDrawdown, 15);
      expect(value('world-longest-underwater')).toBeCloseTo(1 / DAYS_PER_YEAR, 12);
      expect(value('world-worst-30y-return')).toBeNaN();
    });

    it('passes the highest close and shows every new row as info', () => {
      expect(value('stock-max-price')).toBe(321);
      for (const id of ['bear-markets-common', 'equal-weight-premium', 'negative-30y-share']) {
        expect(statistics.targets.find((row) => row.id === id)?.status).toBe('info');
      }
    });
  });

  describe('premiumMeasures (7.1b-01)', () => {
    /** `shares` log total returns per date; the world total return index stays flat. */
    function yearlySample(logs: number[][], ratios: number[][]): MarketSample {
      const base = sample(logs.length + 1);
      return {
        ...base,
        worldTotalReturn: new Float64Array(logs.length).fill(100),
        yearly: logs.map((logTotalReturn, position) => ({
          position,
          logTotalReturn: Float64Array.from(logTotalReturn),
          highRatio: Float64Array.from(ratios[position]),
        })),
      };
    }

    it('rebalances the equal weight and the 20 deepest distances to the high yearly', () => {
      // 22 shares: in the second year only shares 0 and 1 (at their high) triple, the 20 below
      // their high stay flat. Equal weight: year 1 ±0, year 2 ln(26 / 22); strategy: year 2 ±0.
      const flat = new Array<number>(22).fill(0);
      const second = flat.map((_, i) => (i < 2 ? Math.log(3) : 0));
      const ratios = flat.map((_, i) => (i < 2 ? 1 : 0.5));
      const measures = premiumMeasures(yearlySample([flat, flat, second], [flat, ratios, ratios]));
      expect(measures.equalWeight).toBeCloseTo(Math.log(26 / 22) / 2, 14);
      expect(measures.drawdownStrategy).toBeCloseTo(0, 14);
      expect(measures.negativeShare).toBeNaN();
    });

    it('counts negative total returns over every 30-year window', () => {
      // Share 0 gains 10 % (log) a year, share 1 loses as much: 32 dates hold two windows each.
      const logs = Array.from({ length: 32 }, (_, k) => [0.1 * k, -0.1 * k]);
      const ratios = logs.map(() => [1, 1]);
      expect(premiumMeasures(yearlySample(logs, ratios)).negativeShare).toBe(0.5);
    });

    it('is not measurable without a full year', () => {
      const measures = premiumMeasures(yearlySample([[0, 0]], [[1, 1]]));
      expect(measures.equalWeight).toBeNaN();
      expect(measures.drawdownStrategy).toBeNaN();
    });
  });
});
