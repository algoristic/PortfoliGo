import { dayStartTick } from '@app/clock/domain/calendar-logic';
import { isMarketDay } from '@app/market/domain/market-calendar';
import { World } from '@app/world/domain/models/world.model';

import { computeLabStatistics, phaseSegments } from './lab-statistics';
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
    overnight: { world: 0.1, regions: 0.6, stocks: 0.3 },
    checkpoints: [],
  };
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
      expect(value('correlation-within')).toBeCloseTo(1, 6);
      expect(value('correlation-between')).toBeCloseTo(-1, 6);
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
      expect(statistics.targets.find((row) => row.id === 'overnight-share-world')?.status).toBe(
        'info',
      );
    });

    it('takes the overnight shares from the sample and the profile from the intraday part', () => {
      expect(value('overnight-share-world')).toBe(0.1);
      expect(value('overnight-share-regions')).toBe(0.6);
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
});
