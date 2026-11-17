import { DrawdownEpisode } from './models/drawdown.model';

type Values = ArrayLike<number>;

/** Relative distance of each value below its running high (0 at a new high). */
export function drawdowns(values: Values): Float64Array {
  const result = new Float64Array(values.length);
  let high = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < values.length; i++) {
    high = Math.max(high, values[i]);
    result[i] = 1 - values[i] / high;
  }
  return result;
}

export function maxDrawdown(values: Values): number {
  let result = 0;
  for (const value of drawdowns(values)) {
    result = Math.max(result, value);
  }
  return result;
}

/**
 * Episodes whose drawdown reaches at least `threshold`. An episode starts at a running high and
 * ends when the values reach that high again, so one long decline counts once.
 */
export function drawdownEpisodes(values: Values, threshold: number): DrawdownEpisode[] {
  const episodes: DrawdownEpisode[] = [];
  let peak = 0;
  let trough = 0;
  for (let i = 1; i <= values.length; i++) {
    const atEnd = i === values.length;
    if (atEnd || values[i] >= values[peak]) {
      const depth = 1 - values[trough] / values[peak];
      if (trough !== peak && depth >= threshold) {
        episodes.push({ peak, trough, recovery: atEnd ? null : i, depth });
      }
      peak = i;
      trough = i;
    } else if (values[i] < values[trough]) {
      trough = i;
    }
  }
  return episodes;
}

/** Longest run of consecutive values below their running high, in values (0 without a decline). */
export function longestUnderwater(values: Values): number {
  let longest = 0;
  let run = 0;
  for (const drawdown of drawdowns(values)) {
    run = drawdown > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return longest;
}

/**
 * Number of bear markets by the common rule: a fall of at least `decline` from the high starts one,
 * a rise of at least `recovery` from its low ends it, and the next one is measured from the high
 * after that (TS §6.9, 7.1b-06). Unlike `drawdownEpisodes`, an episode doesn't wait for a new high.
 */
export function bearMarketCount(values: Values, decline: number, recovery: number): number {
  let count = 0;
  let inBear = false;
  let high = Number.NEGATIVE_INFINITY;
  let low = Number.POSITIVE_INFINITY;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (!inBear) {
      high = Math.max(high, value);
      if (value <= high * (1 - decline)) {
        inBear = true;
        low = value;
        count++;
      }
    } else if (value < low) {
      low = value;
    } else if (value >= low * (1 + recovery)) {
      inBear = false;
      high = value;
    }
  }
  return count;
}
