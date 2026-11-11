import {
  CALIBRATION_TARGETS,
  CalibrationTarget,
  targetRows,
  targetStatus,
} from './calibration-targets';

describe('calibration-targets', () => {
  const range: CalibrationTarget = { id: 'x', unit: 'percent', min: 0.1, max: 0.2, minYears: 5 };

  describe('targetStatus', () => {
    it('checks the value against min and max', () => {
      expect(targetStatus(range, 0.15, 10)).toBe('ok');
      expect(targetStatus(range, 0.1, 10)).toBe('ok');
      expect(targetStatus(range, 0.25, 10)).toBe('off');
      expect(targetStatus({ id: 'y', unit: 'number', min: 5 }, 7, 1)).toBe('ok');
    });

    it('reports a period shorter than the target needs or a missing value', () => {
      expect(targetStatus(range, 0.15, 4)).toBe('short');
      expect(targetStatus(range, Number.NaN, 10)).toBe('short');
    });

    it('marks quantities without target as info and later ones as open', () => {
      expect(targetStatus({ id: 'z', unit: 'number' }, 1, 10)).toBe('info');
      expect(targetStatus({ id: 'o', unit: 'number', open: true }, Number.NaN, 10)).toBe('open');
    });
  });

  describe('targetRows', () => {
    it('returns one row per target in order', () => {
      const rows = targetRows({ 'world-volatility': 0.16 }, 10);
      expect(rows.map((row) => row.id)).toEqual(CALIBRATION_TARGETS.map((target) => target.id));
      expect(rows.find((row) => row.id === 'world-volatility')).toEqual({
        id: 'world-volatility',
        value: 0.16,
        unit: 'percent',
        min: 0.14,
        max: 0.18,
        minYears: 5,
        status: 'ok',
      });
      expect(rows.find((row) => row.id === 'world-return')?.status).toBe('short');
    });
  });
});
