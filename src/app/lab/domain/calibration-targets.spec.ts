import fc from 'fast-check';

import {
  CALIBRATION_TARGETS,
  CalibrationTarget,
  CalibrationTargetId,
  targetRows,
  targetStatus,
} from './calibration-targets';

function target(id: CalibrationTargetId): CalibrationTarget {
  const found = CALIBRATION_TARGETS.find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(`No calibration target ${id}`);
  }
  return found;
}

/** Target with both bounds and a shortest period, built from arbitrary numbers. */
const arbBoundedTarget = fc
  .tuple(
    fc.double({ min: -10, max: 10, noNaN: true }),
    fc.double({ min: 0, max: 10, noNaN: true }),
    fc.integer({ min: 0, max: 100 }),
  )
  .map(([min, width, minYears]): CalibrationTarget => ({
    id: 'x',
    unit: 'number',
    min,
    max: min + width,
    minYears,
  }));

describe('calibration-targets', () => {
  describe('targetStatus', () => {
    it('accepts every value within the bounds once the period is long enough', () => {
      fc.assert(
        fc.property(
          arbBoundedTarget,
          fc.double({ min: 0, max: 1, noNaN: true }),
          fc.integer({ min: 0, max: 50 }),
          (bounded, position, extraYears) => {
            const { min = 0, max = 0, minYears = 0 } = bounded;
            const value = Math.min(max, min + position * (max - min));
            expect(targetStatus(bounded, value, minYears + extraYears)).toBe('ok');
          },
        ),
      );
    });

    it('rejects every value outside the bounds once the period is long enough', () => {
      fc.assert(
        fc.property(
          arbBoundedTarget,
          fc.double({ min: 1e-9, max: 100, noNaN: true }),
          fc.boolean(),
          (bounded, distance, below) => {
            const { min = 0, max = 0, minYears = 0 } = bounded;
            const value = below ? min - distance : max + distance;
            expect(targetStatus(bounded, value, minYears)).toBe('off');
          },
        ),
      );
    });

    it('reports every value as too short below the shortest period or when missing', () => {
      fc.assert(
        fc.property(
          arbBoundedTarget.filter(({ minYears = 0 }) => minYears > 0),
          fc.double({ noNaN: true }),
          fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }),
          (bounded, value, share) => {
            const years = share * (bounded.minYears ?? 0);
            expect(targetStatus(bounded, value, years)).toBe('short');
            expect(targetStatus(bounded, Number.NaN, (bounded.minYears ?? 0) + 1)).toBe('short');
          },
        ),
      );
    });

    it('checks one-sided targets against their only bound', () => {
      const kurtosis = target('world-kurtosis');
      const years = kurtosis.minYears ?? 0;
      expect(targetStatus(kurtosis, (kurtosis.min ?? 0) + 1, years)).toBe('ok');
      expect(targetStatus(kurtosis, (kurtosis.min ?? 0) - 1, years)).toBe('off');
    });

    it('checks a target with only an upper bound', () => {
      const upperOnly: CalibrationTarget = { id: 'x', unit: 'number', max: 1 };
      expect(targetStatus(upperOnly, 0.5, 0)).toBe('ok');
      expect(targetStatus(upperOnly, -100, 0)).toBe('ok');
      expect(targetStatus(upperOnly, 1.5, 0)).toBe('off');
    });

    it('marks quantities without target as info and later ones as open', () => {
      fc.assert(
        fc.property(fc.double(), fc.double({ min: 0, max: 200 }), (value, years) => {
          expect(targetStatus(target('world-price-return'), value, years)).toBe('info');
          expect(targetStatus(target('overnight-share'), value, years)).toBe('open');
        }),
      );
    });
  });

  describe('targetRows', () => {
    it('returns one row per target in order with its bounds', () => {
      const volatility = target('world-volatility');
      const { min = 0, max = 0, minYears = 0 } = volatility;
      const rows = targetRows({ 'world-volatility': (min + max) / 2 }, minYears);

      expect(rows.map((row) => row.id)).toEqual(CALIBRATION_TARGETS.map((entry) => entry.id));
      expect(rows.find((row) => row.id === 'world-volatility')).toEqual({
        ...volatility,
        value: (min + max) / 2,
        status: 'ok',
      });
    });

    it('keeps exactly the bounds and the period that a target defines', () => {
      const rows = targetRows({}, 1000);
      CALIBRATION_TARGETS.forEach((entry: CalibrationTarget, n) => {
        const { status: _status, ...row } = rows[n];
        const { open: _open, ...defined } = entry;
        expect(row).toStrictEqual({ ...defined, value: Number.NaN });
      });
    });

    it('treats missing values as not measurable', () => {
      const rows = targetRows({}, 1000);
      expect(rows.find((row) => row.id === 'world-return')).toMatchObject({
        value: Number.NaN,
        status: 'short',
      });
    });
  });
});
