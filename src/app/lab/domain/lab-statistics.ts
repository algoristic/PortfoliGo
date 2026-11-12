import { drawdownEpisodes, maxDrawdown } from '@app/analysis/domain/drawdown-logic';
import {
  annualizedVolatility,
  autocorrelation,
  geometricReturn,
  histogram,
  kurtosis,
  logReturns,
  mean,
  median,
  quantile,
  skewness,
  standardDeviation,
} from '@app/analysis/domain/statistics-logic';
import { dayStartTick, weekdayOfDay } from '@app/clock/domain/calendar-logic';
import { DAYS_PER_WEEK } from '@app/clock/domain/models/time.model';
import { MARKET_PHASES, MarketPhase } from '@app/market/domain/models/market-config.model';
import { SIZE_CLASSES } from '@app/world/domain/models/taxonomy.model';
import { World } from '@app/world/domain/models/world.model';

import { CalibrationTargetId, targetRows } from './calibration-targets';
import { MarketSample } from './market-sample';
import {
  CorrelationMatrix,
  DrawdownRow,
  LabStatistics,
  PhaseSegment,
  PhaseShare,
  ReturnDistribution,
  SizeVolatility,
  StatisticsStart,
} from './models/lab-statistics.model';

/** Typical shares of the time per phase (TS §6.3). */
const TYPICAL_PHASE_SHARES: Record<MarketPhase, number> = {
  boom: 0.4,
  normal: 0.35,
  downturn: 0.17,
  crisis: 0.08,
};
const BEAR_MARKET_DEPTH = 0.2;
const CLUSTERING_LAGS = 20;
const DISTRIBUTION_BINS = 40;
const DISTRIBUTION_RANGE = 5;

/**
 * The statistics of the lab (TS §14.2) for a sample, with the measurement rules of TS §6.9:
 * daily log returns, annualized with the market days per year; correlations of shares of the same
 * region (daily closes of different regions fall on different times of day).
 */
export function computeLabStatistics(
  sample: MarketSample,
  world: World,
  start: StatisticsStart,
  marketDaysPerYear: number,
): LabStatistics {
  const marketDays = sample.days.length;
  if (marketDays < 2) {
    throw new RangeError('computeLabStatistics: the period needs at least two market days');
  }
  const years = marketDays / marketDaysPerYear;
  const returnYears = (marketDays - 1) / marketDaysPerYear;
  const worldReturns = logReturns(sample.worldPrice);
  const totalReturns = logReturns(sample.worldTotalReturn);
  const stockVolatility = sample.stockReturns.map((returns) =>
    annualizedVolatility(returns, marketDaysPerYear),
  );
  const sizeVolatility = SIZE_CLASSES.map((size) =>
    volatilityOfSize(
      size,
      stockVolatility.filter((_, i) => world.companies[i].size === size),
    ),
  );
  const last = marketDays - 1;
  const daily = dailyCorrelations(sample.stockReturns, world);
  const weekly = weeklyCorrelations(sample, world);
  const squaredReturns = worldReturns.map((r) => r * r);
  const stockYields = Array.from(sample.dividendSum, (dividends, i) => {
    const meanClose = sample.closeSum[i] / marketDays;
    return dividends / meanClose / years;
  });
  const episodes = drawdownEpisodes(sample.worldTotalReturn, BEAR_MARKET_DEPTH);

  const values: Partial<Record<CalibrationTargetId, number>> = {
    'world-return': geometricReturn(
      sample.worldTotalReturn[0],
      sample.worldTotalReturn[last],
      returnYears,
    ),
    'world-price-return': geometricReturn(
      sample.worldPrice[0],
      sample.worldPrice[last],
      returnYears,
    ),
    'world-volatility': annualizedVolatility(worldReturns, marketDaysPerYear),
    'large-volatility': medianOfSize(sizeVolatility, 'large'),
    'mid-volatility': medianOfSize(sizeVolatility, 'mid'),
    'small-volatility': medianOfSize(sizeVolatility, 'small'),
    'correlation-within': daily.within,
    'correlation-between': daily.between,
    'weekly-correlation-within': weekly.within,
    'weekly-correlation-between': weekly.between,
    'bear-markets': episodes.length / returnYears,
    'world-kurtosis': kurtosis(worldReturns),
    'stock-kurtosis': median(sample.stockReturns.map((returns) => kurtosis(returns))),
    'clustering-lag1': autocorrelation(squaredReturns, 1),
    'clustering-mean': mean(
      Array.from({ length: CLUSTERING_LAGS }, (_, lag) => autocorrelation(squaredReturns, lag + 1)),
    ),
    'world-dividend-yield': (sum(totalReturns) - sum(worldReturns)) / returnYears,
    'stock-dividend-yield-median': median(stockYields),
    'stock-dividend-yield-max': Math.max(...stockYields),
  };

  return {
    start,
    fromTick: dayStartTick(sample.days[0]),
    toTick: dayStartTick(sample.days[last] + 1),
    marketDays,
    years,
    targets: targetRows(values, years),
    phases: phaseSegments(sample.days, sample.phases),
    phaseShares: phaseShares(sample.phases),
    correlations: daily.matrix,
    sizeVolatility,
    distribution: returnDistribution(worldReturns),
    maxDrawdown: maxDrawdown(sample.worldTotalReturn),
    drawdowns: episodes.map((episode): DrawdownRow => ({
      peakTick: dayStartTick(sample.days[episode.peak]),
      troughTick: dayStartTick(sample.days[episode.trough]),
      recoveryTick: episode.recovery === null ? null : dayStartTick(sample.days[episode.recovery]),
      depth: episode.depth,
    })),
  };
}

/** Consecutive market days with the same phase. */
export function phaseSegments(days: ArrayLike<number>, phases: ArrayLike<number>): PhaseSegment[] {
  const segments: PhaseSegment[] = [];
  let start = 0;
  for (let d = 1; d <= days.length; d++) {
    if (d === days.length || phases[d] !== phases[start]) {
      segments.push({
        phase: MARKET_PHASES[phases[start]],
        fromTick: dayStartTick(days[start]),
        toTick: dayStartTick(days[d - 1] + 1),
        marketDays: d - start,
      });
      start = d;
    }
  }
  return segments;
}

function phaseShares(phases: ArrayLike<number>): PhaseShare[] {
  const counts = new Array<number>(MARKET_PHASES.length).fill(0);
  for (let d = 0; d < phases.length; d++) {
    counts[phases[d]]++;
  }
  return MARKET_PHASES.map((phase, p) => ({
    phase,
    share: counts[p] / phases.length,
    typical: TYPICAL_PHASE_SHARES[phase],
  }));
}

function volatilityOfSize(size: SizeVolatility['size'], volatility: number[]): SizeVolatility {
  const sorted = Float64Array.from(volatility).sort();
  return {
    size,
    count: sorted.length,
    p10: quantile(sorted, 0.1),
    median: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
  };
}

function medianOfSize(volatility: SizeVolatility[], size: SizeVolatility['size']): number {
  return volatility.find((entry) => entry.size === size)?.median ?? Number.NaN;
}

interface DailyCorrelations {
  matrix: CorrelationMatrix;
  within: number;
  between: number;
}

/**
 * Mean pairwise correlation per sector pair over all pairs of shares in the same region. Within
 * and between are pooled over all pairs, not averaged over the matrix cells.
 */
function dailyCorrelations(returns: Float32Array[], world: World): DailyCorrelations {
  const sectorIds = world.sectors.map((sector) => sector.id as string);
  const sectorOf = world.companies.map((company) => sectorIds.indexOf(company.sectorId));
  const sectorCount = sectorIds.length;
  const sums = new Float64Array(sectorCount * sectorCount);
  const counts = new Float64Array(sectorCount * sectorCount);
  const pooled = pairCorrelations(
    returns,
    (i, j) => world.companies[i].regionId === world.companies[j].regionId,
    (i, j) => sectorOf[i] === sectorOf[j],
    (i, j, value) => {
      const a = sectorOf[i];
      const b = sectorOf[j];
      sums[a * sectorCount + b] += value;
      counts[a * sectorCount + b]++;
      if (a !== b) {
        sums[b * sectorCount + a] += value;
        counts[b * sectorCount + a]++;
      }
    },
  );
  const values = sectorIds.map((_, a) =>
    sectorIds.map((__, b) => {
      const n = counts[a * sectorCount + b];
      return n > 0 ? sums[a * sectorCount + b] / n : Number.NaN;
    }),
  );
  return { matrix: { sectorIds, values }, ...pooled };
}

/** Weekly log returns from the last close of each calendar week, all pairs of shares. */
function weeklyCorrelations(
  sample: MarketSample,
  world: World,
): { within: number; between: number } {
  const weekOf = (day: number): number => (day - weekdayOfDay(day)) / DAYS_PER_WEEK;
  // Return d (close d → d + 1) belongs to the week of day d + 1.
  const weekStarts: number[] = [];
  for (let d = 0; d < sample.days.length - 1; d++) {
    if (d === 0 || weekOf(sample.days[d + 1]) !== weekOf(sample.days[d])) {
      weekStarts.push(d);
    }
  }
  const weekly = sample.stockReturns.map((daily) => {
    const result = new Float32Array(weekStarts.length);
    weekStarts.forEach((startIndex, w) => {
      const end = w + 1 < weekStarts.length ? weekStarts[w + 1] : daily.length;
      let total = 0;
      for (let d = startIndex; d < end; d++) {
        total += daily[d];
      }
      result[w] = total;
    });
    return result;
  });
  return pairCorrelations(
    weekly,
    () => true,
    (i, j) => world.companies[i].sectorId === world.companies[j].sectorId,
  );
}

/**
 * Pearson correlations of all pairs `i < j` that pass `include`, pooled into the mean within
 * (`sameGroup`) and between groups. Works on z scores so that each pair costs one dot product.
 */
function pairCorrelations(
  returns: Float32Array[],
  include: (i: number, j: number) => boolean,
  sameGroup: (i: number, j: number) => boolean,
  onPair?: (i: number, j: number, value: number) => void,
): { within: number; between: number } {
  const n = returns.length === 0 ? 0 : returns[0].length;
  const scores = returns.map((series) => {
    const m = mean(series);
    const s = standardDeviation(series);
    return Float64Array.from(series, (value) => (s > 0 ? (value - m) / s : Number.NaN));
  });
  let withinSum = 0;
  let withinCount = 0;
  let betweenSum = 0;
  let betweenCount = 0;
  for (let i = 0; i < scores.length; i++) {
    for (let j = i + 1; j < scores.length; j++) {
      if (!include(i, j)) {
        continue;
      }
      const a = scores[i];
      const b = scores[j];
      let dot = 0;
      for (let d = 0; d < n; d++) {
        dot += a[d] * b[d];
      }
      const value = dot / (n - 1);
      if (Number.isNaN(value)) {
        continue;
      }
      onPair?.(i, j, value);
      if (sameGroup(i, j)) {
        withinSum += value;
        withinCount++;
      } else {
        betweenSum += value;
        betweenCount++;
      }
    }
  }
  return {
    within: withinCount > 0 ? withinSum / withinCount : Number.NaN,
    between: betweenCount > 0 ? betweenSum / betweenCount : Number.NaN,
  };
}

function returnDistribution(returns: Float64Array): ReturnDistribution {
  const m = mean(returns);
  const s = standardDeviation(returns);
  const scores = returns.map((value) => (value - m) / s);
  const result = histogram(scores, DISTRIBUTION_BINS, -DISTRIBUTION_RANGE, DISTRIBUTION_RANGE);
  const normal = result.counts.map((_, bin) => {
    const center = result.min + (bin + 0.5) * result.binWidth;
    return (
      (returns.length * result.binWidth * Math.exp(-0.5 * center * center)) / Math.sqrt(2 * Math.PI)
    );
  });
  return {
    min: result.min,
    binWidth: result.binWidth,
    counts: result.counts,
    normal,
    outside: result.below + result.above,
    skewness: skewness(returns),
    kurtosis: kurtosis(returns),
  };
}

function sum(values: ArrayLike<number>): number {
  let total = 0;
  for (let i = 0; i < values.length; i++) {
    total += values[i];
  }
  return total;
}
