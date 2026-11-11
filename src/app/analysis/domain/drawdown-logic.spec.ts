import { drawdownEpisodes, drawdowns, maxDrawdown } from './drawdown-logic';

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
  });

  describe('drawdownEpisodes', () => {
    it('returns episodes from a high to the next high that reach the threshold', () => {
      expect(drawdownEpisodes(values, 0.2)).toEqual([
        { peak: 1, trough: 2, recovery: 4, depth: 0.25 },
        { peak: 4, trough: 6, recovery: null, depth: 1 - 80 / 130 },
      ]);
    });

    it('counts one long decline once and skips shallow ones', () => {
      expect(drawdownEpisodes([100, 70, 75, 60, 100, 95, 101], 0.2)).toEqual([
        { peak: 0, trough: 3, recovery: 4, depth: 0.4 },
      ]);
    });
  });
});
