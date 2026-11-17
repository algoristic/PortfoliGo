import fc from 'fast-check';

import {
  bearMarketCount,
  drawdownEpisodes,
  drawdowns,
  longestUnderwater,
  maxDrawdown,
} from './drawdown-logic';

const arbSeries = fc.array(fc.double({ min: 0.01, max: 1e6, noNaN: true }), {
  minLength: 1,
  maxLength: 60,
});

/** Brute force over all pairs: the largest relative fall from an earlier value. */
function bruteForceMaxDrawdown(values: readonly number[]): number {
  let max = 0;
  for (let i = 0; i < values.length; i++) {
    for (let j = i; j < values.length; j++) {
      max = Math.max(max, 1 - values[j] / values[i]);
    }
  }
  return max;
}

describe('drawdown-logic', () => {
  const values = [100, 120, 90, 100, 130, 125, 80, 85];

  describe('drawdowns', () => {
    it('measures the distance below the running high', () => {
      expect(Array.from(drawdowns(values))).toEqual([
        0,
        0,
        0.25,
        1 - 100 / 120,
        0,
        1 - 125 / 130,
        1 - 80 / 130,
        1 - 85 / 130,
      ]);
    });
  });

  describe('maxDrawdown', () => {
    it('returns the deepest drawdown', () => {
      expect(maxDrawdown(values)).toBeCloseTo(50 / 130, 12);
      expect(maxDrawdown([1, 2, 3])).toBe(0);
    });

    it('equals the largest fall over all pairs of any positive series', () => {
      fc.assert(
        fc.property(arbSeries, (series) => {
          expect(maxDrawdown(series)).toBe(bruteForceMaxDrawdown(series));
          for (const drawdown of drawdowns(series)) {
            expect(drawdown >= 0 && drawdown < 1).toBe(true);
          }
        }),
      );
    });
  });

  describe('drawdownEpisodes', () => {
    it('returns episodes from a high to the next high that reach the threshold', () => {
      expect(drawdownEpisodes(values, 0.2)).toEqual([
        { peak: 1, trough: 2, recovery: 4, depth: 0.25 },
        { peak: 4, trough: 6, recovery: null, depth: 1 - 80 / 130 },
      ]);
    });

    it('finds non-overlapping episodes and the deepest drawdown among them', () => {
      fc.assert(
        fc.property(
          arbSeries,
          fc.double({ min: 0.01, max: 0.99, noNaN: true }),
          (series, threshold) => {
            const episodes = drawdownEpisodes(series, threshold);
            let previousEnd = -1;
            for (const { peak, trough, recovery, depth } of episodes) {
              expect(peak).toBeGreaterThanOrEqual(previousEnd);
              expect(trough).toBeGreaterThan(peak);
              expect(depth).toBeGreaterThanOrEqual(threshold);
              expect(depth).toBe(1 - series[trough] / series[peak]);
              if (recovery !== null) {
                expect(recovery).toBeGreaterThan(trough);
                expect(series[recovery]).toBeGreaterThanOrEqual(series[peak]);
              }
              previousEnd = recovery ?? series.length;
            }
            const deepest = Math.max(0, ...episodes.map((episode) => episode.depth));
            const max = maxDrawdown(series);
            expect(deepest).toBe(max >= threshold ? max : 0);
          },
        ),
      );
    });

    it('includes an episode whose depth equals the threshold', () => {
      expect(drawdownEpisodes([100, 75, 100], 0.25)).toEqual([
        { peak: 0, trough: 1, recovery: 2, depth: 0.25 },
      ]);
    });

    it('reports no episode without a decline, even for a threshold of 0', () => {
      expect(drawdownEpisodes([1, 2, 2, 3], 0)).toEqual([]);
    });

    it('counts one long decline once and skips shallow ones', () => {
      expect(drawdownEpisodes([100, 70, 75, 60, 100, 95, 101], 0.2)).toEqual([
        { peak: 0, trough: 3, recovery: 4, depth: 0.4 },
      ]);
    });
  });
  describe('longestUnderwater', () => {
    it('counts the longest run below the running high', () => {
      expect(longestUnderwater(values)).toBe(3);
      expect(longestUnderwater([1, 2, 3])).toBe(0);
      expect(longestUnderwater([])).toBe(0);
    });
  });

  describe('bearMarketCount', () => {
    // TS §6.9: worked example of the common count (−20 % from the high, +20 % from the low)
    // against the episodes to a new high of the calibration target.
    const example = [100, 85, 79, 90, 96, 70, 84, 100, 75, 120, 95];

    it('counts the bear markets of the example in TS §6.9', () => {
      expect(bearMarketCount(example, 0.2, 0.2)).toBe(4);
      expect(drawdownEpisodes(example, 0.2)).toHaveLength(3);
    });

    it.each([
      [[100, 80], 1],
      [[100, 80.01], 0],
      [[100, 80, 95, 76], 1],
      [[100, 80, 96, 76.8], 2],
    ])('counts %j as %i', (series, expected) => {
      expect(bearMarketCount(series, 0.2, 0.2)).toBe(expected);
    });

    it('never counts more than the declines of at least the threshold allow', () => {
      fc.assert(
        fc.property(arbSeries, (series) => {
          const count = bearMarketCount(series, 0.2, 0.2);
          expect(count).toBeGreaterThanOrEqual(drawdownEpisodes(series, 0.2).length);
          expect(count === 0).toBe(maxDrawdown(series) < 0.2);
        }),
      );
    });
  });
});
