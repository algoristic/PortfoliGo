import { Histogram } from './models/histogram.model';

type Values = ArrayLike<number>;

export function mean(values: Values): number {
  if (values.length === 0) {
    return Number.NaN;
  }
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
  }
  return sum / values.length;
}

/** Sample variance (divisor `n − 1`); `NaN` for fewer than two values. */
export function variance(values: Values): number {
  if (values.length < 2) {
    return Number.NaN;
  }
  const m = mean(values);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const d = values[i] - m;
    sum += d * d;
  }
  return sum / (values.length - 1);
}

export function standardDeviation(values: Values): number {
  return Math.sqrt(variance(values));
}

/** Log returns `ln(v[i] / v[i − 1])`, one fewer than values. */
export function logReturns(values: Values): Float64Array {
  const result = new Float64Array(Math.max(0, values.length - 1));
  for (let i = 1; i < values.length; i++) {
    result[i - 1] = Math.log(values[i] / values[i - 1]);
  }
  return result;
}

/** Standard deviation of the returns scaled to a year, e.g. `periodsPerYear = 261` for days. */
export function annualizedVolatility(returns: Values, periodsPerYear: number): number {
  return standardDeviation(returns) * Math.sqrt(periodsPerYear);
}

/** Compound annual growth rate from `first` to `last` over `years`. */
export function geometricReturn(first: number, last: number, years: number): number {
  if (!(years > 0) || !(first > 0)) {
    return Number.NaN;
  }
  return Math.pow(last / first, 1 / years) - 1;
}

/** Sample covariance (divisor `n − 1`); `NaN` for fewer than two pairs or different lengths. */
export function covariance(xs: Values, ys: Values): number {
  const n = xs.length;
  if (n !== ys.length || n < 2) {
    return Number.NaN;
  }
  const mx = mean(xs);
  const my = mean(ys);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (xs[i] - mx) * (ys[i] - my);
  }
  return sum / (n - 1);
}

/**
 * Beta of `returns` against `benchmark`: covariance ÷ variance of the benchmark; `NaN` if the
 * benchmark is constant or the lengths differ. A series against itself gives exactly 1.
 */
export function beta(returns: Values, benchmark: Values): number {
  // A constant benchmark gives 0 / 0 = NaN.
  return covariance(returns, benchmark) / covariance(benchmark, benchmark);
}

/** Pearson correlation; `NaN` if a series is constant or the lengths differ. */
export function correlation(xs: Values, ys: Values): number {
  const n = xs.length;
  if (n !== ys.length || n < 2) {
    return Number.NaN;
  }
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const denominator = Math.sqrt(sxx * syy);
  return denominator > 0 ? sxy / denominator : Number.NaN;
}

/** Population skewness (third standardized moment). */
export function skewness(values: Values): number {
  const { m2, m3 } = centralMoments(values);
  return m2 > 0 ? m3 / Math.pow(m2, 1.5) : Number.NaN;
}

/** Population kurtosis (fourth standardized moment); 3 for a normal distribution. */
export function kurtosis(values: Values): number {
  const { m2, m4 } = centralMoments(values);
  return m2 > 0 ? m4 / (m2 * m2) : Number.NaN;
}

/** Autocorrelation at `lag` with the overall mean and variance (as in the sample ACF). */
export function autocorrelation(values: Values, lag: number): number {
  const n = values.length;
  if (lag < 1 || lag >= n) {
    return Number.NaN;
  }
  const m = mean(values);
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    const d = values[i] - m;
    denominator += d * d;
    if (i >= lag) {
      numerator += d * (values[i - lag] - m);
    }
  }
  return denominator > 0 ? numerator / denominator : Number.NaN;
}

/** Quantile of ascending values with linear interpolation between ranks (`q` in `[0, 1]`). */
export function quantile(sorted: Values, q: number): number {
  const n = sorted.length;
  if (n === 0 || q < 0 || q > 1) {
    return Number.NaN;
  }
  const position = q * (n - 1);
  const lower = Math.floor(position);
  const upper = Math.min(lower + 1, n - 1);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function median(values: Values): number {
  return quantile(Float64Array.from(values).sort(), 0.5);
}

/** Counts values in `bins` equally wide buckets; `max` belongs to the last bucket. */
export function histogram(values: Values, bins: number, min: number, max: number): Histogram {
  if (!Number.isInteger(bins) || bins < 1 || !(max > min)) {
    throw new RangeError(`histogram: invalid bins ${bins} or range ${min}…${max}`);
  }
  const binWidth = (max - min) / bins;
  const counts = new Array<number>(bins).fill(0);
  let below = 0;
  let above = 0;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value < min) {
      below++;
    } else if (value > max) {
      above++;
    } else {
      counts[Math.min(bins - 1, Math.floor((value - min) / binWidth))]++;
    }
  }
  return { min, max, binWidth, counts, below, above };
}

function centralMoments(values: Values): { m2: number; m3: number; m4: number } {
  const n = values.length;
  if (n === 0) {
    return { m2: Number.NaN, m3: Number.NaN, m4: Number.NaN };
  }
  const m = mean(values);
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (let i = 0; i < n; i++) {
    const d = values[i] - m;
    const d2 = d * d;
    m2 += d2;
    m3 += d2 * d;
    m4 += d2 * d2;
  }
  return { m2: m2 / n, m3: m3 / n, m4: m4 / n };
}
