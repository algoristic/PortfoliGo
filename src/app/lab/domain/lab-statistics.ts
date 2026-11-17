import {
  bearMarketCount,
  drawdownEpisodes,
  longestUnderwater,
  maxDrawdown,
} from '@app/analysis/domain/drawdown-logic';
import {
  annualizedVolatility,
  autocorrelation,
  correlation,
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
import { dayStartTick, tickToDateTime, weekdayOfDay } from '@app/clock/domain/calendar-logic';
import { DAYS_PER_WEEK } from '@app/clock/domain/models/time.model';
import { MARKET_PHASES, MarketPhase } from '@app/market/domain/models/market-config.model';
import { SIZE_CLASSES } from '@app/world/domain/models/taxonomy.model';
import { World } from '@app/world/domain/models/world.model';

import { CalibrationTargetId, targetRows } from './calibration-targets';
import { rollingWindows, WINDOW_YEARS } from './long-term-statistics';
import { MarketSample } from './market-sample';
import {
  CorrelationMatrix,
  DrawdownRow,
  IntradayStatistics,
  LabStatistics,
  LongTermStatistics,
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
/** Rise from the low that ends a bear market in the common count (7.1b-06). */
const BEAR_MARKET_RECOVERY = 0.2;
/** Shares of the strategy with the deepest distances to their high (7.1b-01). */
const DRAWDOWN_STRATEGY_SHARES = 20;
/** Holding period of the share of shares with a negative return (7.1b-01). */
const NEGATIVE_RETURN_YEARS = 30;
const MONTHS_PER_YEAR = 12;
const CLUSTERING_LAGS = 20;
const DISTRIBUTION_BINS = 40;
const DISTRIBUTION_RANGE = 5;

/**
 * The statistics of the lab (TS §14.2) for a sample, with the measurement rules of TS §6.9:
 * daily log returns, annualized with the market days per year; correlations of shares of the same
 * region (daily closes of different regions fall on different times of day), the targets over large
 * caps (E-31). The intraday statistics come from the minute curves (`computeIntradayStatistics`).
 */
export function computeLabStatistics(
  sample: MarketSample,
  intraday: IntradayStatistics,
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
  const worldMeasures = worldReturnMeasures(sample, marketDaysPerYear);
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
  const large = largeCapCorrelations(sample.stockReturns, world);
  const weekly = weeklyCorrelations(sample, world);
  const squaredReturns = worldReturns.map((r) => r * r);
  const stockYields = Array.from(sample.dividendSum, (dividends, i) => {
    const meanClose = sample.closeSum[i] / marketDays;
    return dividends / meanClose / years;
  });
  const episodes = drawdownEpisodes(sample.worldTotalReturn, BEAR_MARKET_DEPTH);
  const longTerm = longTermStatistics(sample, marketDaysPerYear);
  const thirtyYears = longTerm.windows.find((window) => window.years === 30);
  const regions = regionMeasures(sample, marketDaysPerYear);
  const premiums = premiumMeasures(sample);

  const values: Partial<Record<CalibrationTargetId, number>> = {
    'world-return': worldMeasures.worldReturn,
    'world-price-return': geometricReturn(
      sample.worldPrice[0],
      sample.worldPrice[last],
      returnYears,
    ),
    'world-volatility': worldMeasures.worldVolatility,
    'world-volatility-weekly': periodVolatility(
      sample.worldPrice,
      periodEnds(sample.days, weekOf),
      marketDaysPerYear / DAYS_PER_WEEK_OF_MARKET,
    ),
    'world-volatility-monthly': periodVolatility(
      sample.worldPrice,
      periodEnds(sample.days, monthOf),
      MONTHS_PER_YEAR,
    ),
    'world-autocorrelation-lag1': autocorrelation(worldReturns, 1),
    'world-max-drawdown': maxDrawdown(sample.worldTotalReturn),
    'world-longest-underwater': longestUnderwater(sample.worldTotalReturn) / marketDaysPerYear,
    'world-worst-30y-return': thirtyYears?.totalReturn.min ?? Number.NaN,
    'region-volatility': regions.volatility,
    'region-max-drawdown': regions.maxDrawdown,
    'region-correlation': regions.correlation,
    'large-volatility': medianOfSize(sizeVolatility, 'large'),
    'mid-volatility': medianOfSize(sizeVolatility, 'mid'),
    'small-volatility': medianOfSize(sizeVolatility, 'small'),
    'correlation-within': large.within,
    'correlation-between': large.between,
    'correlation-within-all': daily.within,
    'correlation-between-all': daily.between,
    'weekly-correlation-within': weekly.within,
    'weekly-correlation-between': weekly.between,
    'bear-markets': episodes.length / returnYears,
    'bear-markets-common':
      bearMarketCount(sample.worldPrice, BEAR_MARKET_DEPTH, BEAR_MARKET_RECOVERY) / returnYears,
    'world-kurtosis': kurtosis(worldReturns),
    'stock-kurtosis': median(sample.stockReturns.map((returns) => kurtosis(returns))),
    'stock-autocorrelation-lag1': median(
      sample.stockReturns.map((returns) => autocorrelation(returns, 1)),
    ),
    'stock-max-price': sample.maxPrice,
    'equal-weight-premium': premiums.equalWeight,
    'drawdown-strategy-premium': premiums.drawdownStrategy,
    'negative-30y-share': premiums.negativeShare,
    'clustering-lag1': autocorrelation(squaredReturns, 1),
    'clustering-mean': mean(
      Array.from({ length: CLUSTERING_LAGS }, (_, lag) => autocorrelation(squaredReturns, lag + 1)),
    ),
    'world-dividend-yield': worldMeasures.worldDividendYield,
    'stock-dividend-yield-median': median(stockYields),
    'stock-dividend-yield-max': Math.max(...stockYields),
    'intraday-profile': intraday.profileRatio,
    'overnight-share-world': sample.overnight.world,
    'overnight-share-north-america': sample.overnight.regions['north-america'],
    'overnight-share-europe': sample.overnight.regions.europe,
    'overnight-share-asia-pacific': sample.overnight.regions['asia-pacific'],
    'overnight-share-emerging-markets': sample.overnight.regions['emerging-markets'],
    'overnight-share-stocks': sample.overnight.stocks,
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
    intraday,
    longTerm,
  };
}

/** Market days of a calendar week (TS §6.9: weekly returns over five market days). */
const DAYS_PER_WEEK_OF_MARKET = 5;

function weekOf(day: number): number {
  return (day - weekdayOfDay(day)) / DAYS_PER_WEEK;
}

function monthOf(day: number): number {
  const { year, month } = tickToDateTime(dayStartTick(day));
  return year * MONTHS_PER_YEAR + month;
}

/** Positions of the last market day of each period (week, month), the first period included. */
function periodEnds(days: ArrayLike<number>, periodOf: (day: number) => number): number[] {
  const ends: number[] = [];
  for (let d = 0; d < days.length; d++) {
    if (d === days.length - 1 || periodOf(days[d + 1]) !== periodOf(days[d])) {
      ends.push(d);
    }
  }
  return ends;
}

/** Volatility p. a. of the log returns between the closes at `ends`. */
function periodVolatility(
  closes: ArrayLike<number>,
  ends: number[],
  periodsPerYear: number,
): number {
  return annualizedVolatility(logReturns(ends.map((position) => closes[position])), periodsPerYear);
}

/**
 * Broad regional price indices (7.1b-05, 7.1b-07): medians over the regions of the daily volatility
 * and the largest drawdown, and the mean pairwise correlation of monthly log returns (daily closes
 * of different regions fall on different times of day).
 */
function regionMeasures(
  sample: MarketSample,
  marketDaysPerYear: number,
): { volatility: number; maxDrawdown: number; correlation: number } {
  const regions = sample.regionPrices;
  const months = periodEnds(sample.days, monthOf);
  const monthly = regions.map(({ closes }) =>
    logReturns(months.map((position) => closes[position])),
  );
  const pairs: number[] = [];
  for (let a = 0; a < monthly.length; a++) {
    for (let b = a + 1; b < monthly.length; b++) {
      pairs.push(correlation(monthly[a], monthly[b]));
    }
  }
  return {
    volatility: median(
      regions.map(({ closes }) => annualizedVolatility(logReturns(closes), marketDaysPerYear)),
    ),
    maxDrawdown: median(regions.map(({ closes }) => maxDrawdown(closes))),
    correlation: mean(pairs),
  };
}

/**
 * Premiums of TS §6.9 (7.1b-01), gross of costs and taxes, rebalanced at the yearly dates of the
 * sample: the log excess return p. a. of the equal weight of all shares and of the
 * `DRAWDOWN_STRATEGY_SHARES` shares furthest below their high (from the second date on, so that the
 * high has a year of history) against the world total return index over the same years; the share
 * of the shares with a negative total return over all windows of `NEGATIVE_RETURN_YEARS` years.
 */
export function premiumMeasures(sample: MarketSample): {
  equalWeight: number;
  drawdownStrategy: number;
  negativeShare: number;
} {
  const { yearly, worldTotalReturn } = sample;
  const years = yearly.length - 1;
  const worldGrowth = (k: number): number =>
    Math.log(worldTotalReturn[yearly[k + 1].position] / worldTotalReturn[yearly[k].position]);
  const portfolioGrowth = (k: number, shares: number[]): number => {
    let total = 0;
    for (const i of shares) {
      total += Math.exp(yearly[k + 1].logTotalReturn[i] - yearly[k].logTotalReturn[i]);
    }
    return Math.log(total / shares.length);
  };
  const all = Array.from({ length: years < 0 ? 0 : yearly[0].logTotalReturn.length }, (_, i) => i);

  let equalWeight = 0;
  let strategy = 0;
  for (let k = 0; k < years; k++) {
    const excess = portfolioGrowth(k, all) - worldGrowth(k);
    equalWeight += excess;
    if (k > 0) {
      const ratios = yearly[k].highRatio;
      const deepest = [...all]
        .sort((a, b) => ratios[a] - ratios[b] || a - b)
        .slice(0, DRAWDOWN_STRATEGY_SHARES);
      strategy += portfolioGrowth(k, deepest) - worldGrowth(k);
    }
  }

  let negative = 0;
  let windows = 0;
  for (let k = 0; k + NEGATIVE_RETURN_YEARS <= years; k++) {
    const start = yearly[k].logTotalReturn;
    const end = yearly[k + NEGATIVE_RETURN_YEARS].logTotalReturn;
    for (const i of all) {
      windows++;
      if (end[i] - start[i] < 0) {
        negative++;
      }
    }
  }

  return {
    equalWeight: years >= 1 && all.length > 0 ? equalWeight / years : Number.NaN,
    drawdownStrategy: years >= 2 && all.length > 0 ? strategy / (years - 1) : Number.NaN,
    negativeShare: windows > 0 ? negative / windows : Number.NaN,
  };
}

/** Return, volatility and dividend yield of the world index over the whole sample (TS §6.9). */
export function worldReturnMeasures(
  sample: MarketSample,
  marketDaysPerYear: number,
): { worldReturn: number; worldVolatility: number; worldDividendYield: number } {
  const last = sample.days.length - 1;
  const returnYears = last / marketDaysPerYear;
  const worldReturns = logReturns(sample.worldPrice);
  const totalReturns = logReturns(sample.worldTotalReturn);
  return {
    worldReturn: geometricReturn(
      sample.worldTotalReturn[0],
      sample.worldTotalReturn[last],
      returnYears,
    ),
    worldVolatility: annualizedVolatility(worldReturns, marketDaysPerYear),
    worldDividendYield: (sum(totalReturns) - sum(worldReturns)) / returnYears,
  };
}

/** Checkpoints and rolling windows of the world index (TS §6.9, E-22). */
export function longTermStatistics(
  sample: MarketSample,
  marketDaysPerYear: number,
): LongTermStatistics {
  return {
    checkpoints: sample.checkpoints,
    windows: WINDOW_YEARS.map((years) =>
      rollingWindows(sample.worldPrice, sample.worldTotalReturn, years, marketDaysPerYear),
    ),
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

export function phaseShares(phases: ArrayLike<number>): PhaseShare[] {
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

/** Mean daily correlation within and between sectors over pairs of large caps of the same region. */
function largeCapCorrelations(
  returns: Float32Array[],
  world: World,
): { within: number; between: number } {
  const { companies } = world;
  return pairCorrelations(
    returns,
    (i, j) =>
      companies[i].size === 'large' &&
      companies[j].size === 'large' &&
      companies[i].regionId === companies[j].regionId,
    (i, j) => companies[i].sectorId === companies[j].sectorId,
  );
}

/** Weekly log returns from the last close of each calendar week, all pairs of shares. */
function weeklyCorrelations(
  sample: MarketSample,
  world: World,
): { within: number; between: number } {
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
