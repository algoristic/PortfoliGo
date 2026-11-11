import { computeLabStatistics, phaseSegments } from './lab-statistics';
import { MarketSample } from './market-sample';

import { annualizedVolatility, logReturns } from '../../analysis/domain/statistics-logic';
import { dayStartTick } from '../../clock/domain/calendar-logic';
import { isMarketDay } from '../../market/domain/market-calendar';
import { World } from '../../world/domain/models/world.model';

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

function sample(count: number): MarketSample {
  const days = marketDays(count);
  const base = Float32Array.from({ length: count - 1 }, (_, d) => 0.01 * Math.sin(d * 1.7));
  const other = Float32Array.from({ length: count - 1 }, (_, d) => 0.02 * Math.cos(d * 0.9));
  const worldPrice = new Float64Array(count);
  const worldTotalReturn = new Float64Array(count);
  for (let d = 0; d < count; d++) {
    worldPrice[d] = 100 * Math.exp(0.05 * (d / DAYS_PER_YEAR) + 0.01 * Math.sin(d));
    worldTotalReturn[d] = worldPrice[d] * Math.exp(0.02 * (d / DAYS_PER_YEAR));
  }
  return {
    days,
    phases: Uint8Array.from({ length: count }, (_, d) => (d < count / 2 ? 0 : 3)),
    worldPrice,
    worldTotalReturn,
    stockReturns: [base, base, base.map((r) => -r), other],
    dividendSum: Float64Array.from([4, 0, 2, 1]),
    closeSum: Float64Array.from([100, 100, 50, 50]).map((close) => close * count),
  };
}

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
    const count = 2 * DAYS_PER_YEAR + 1;
    const input = sample(count);
    const statistics = computeLabStatistics(input, world, 'epoch', DAYS_PER_YEAR);
    const value = (id: string): number | undefined =>
      statistics.targets.find((row) => row.id === id)?.value;

    it('measures the period in market days', () => {
      expect(statistics.marketDays).toBe(count);
      expect(statistics.years).toBeCloseTo(count / DAYS_PER_YEAR, 12);
      expect(statistics.fromTick).toBe(dayStartTick(input.days[0]));
      expect(statistics.toTick).toBe(dayStartTick(input.days[count - 1] + 1));
    });

    it('measures returns, volatility and dividend yield of the world index', () => {
      expect(value('world-volatility')).toBeCloseTo(
        annualizedVolatility(logReturns(input.worldPrice), DAYS_PER_YEAR),
        12,
      );
      expect(value('world-price-return')).toBeCloseTo(
        Math.pow(input.worldPrice[count - 1] / input.worldPrice[0], DAYS_PER_YEAR / (count - 1)) -
          1,
        12,
      );
      expect(value('world-dividend-yield')).toBeCloseTo(0.02, 10);
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
      expect(large?.count).toBe(2);
      expect(large?.median).toBeCloseTo(
        annualizedVolatility(input.stockReturns[0], DAYS_PER_YEAR),
        6,
      );
      expect(value('small-volatility')).toBeCloseTo(large?.median ?? 0, 6);
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
      expect(statistics.targets.find((row) => row.id === 'overnight-share')?.status).toBe('open');
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
      const result = computeLabStatistics(drawdown, world, 'epoch', DAYS_PER_YEAR);
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
      expect(() => computeLabStatistics(sample(1), world, 'epoch', DAYS_PER_YEAR)).toThrow(
        RangeError,
      );
    });
  });
});
