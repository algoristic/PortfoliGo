import { median } from '@app/analysis/domain/statistics-logic';

import { CALIBRATION_TARGETS, CalibrationTarget } from './calibration-targets';
import {
  calibrationReport,
  CalibrationRun,
  measureCalibrationRun,
  measuredOverLongRun,
  targetValue,
} from './testing/calibration-run';

import { TEST_SEEDS } from '../../../testing/seeds';

// Info run of the calibration on a broad set of fresh seeds (E-34 extended, 7.1b-03, AP 7.3a). It
// checks no band: the rule of the suite stays the median of `calib-1` … `calib-5` until AP 7.3e
// recalibrates against at least 20 fresh seeds. The report shows the medians as the baseline.

/** About 20 s per seed (prehistory, 100 years, statistics of both). */
const RUN_TIMEOUT = 1_800_000;

describe('calibration targets on a broad seed set (info, E-34)', () => {
  let runs: CalibrationRun[];

  beforeAll(() => {
    runs = TEST_SEEDS.calibrationBroad.map(measureCalibrationRun);
  }, RUN_TIMEOUT);

  it('measures every banded target on at least 20 fresh seeds and reports them', () => {
    console.info(calibrationReport('Broad seed set (info)', runs));
    expect(runs.length).toBeGreaterThanOrEqual(20);
    for (const target of CALIBRATION_TARGETS as readonly CalibrationTarget[]) {
      if (target.min !== undefined || target.max !== undefined) {
        const values = runs.map((run) =>
          targetValue(measuredOverLongRun(target) ? run.long : run.prehistory, target.id),
        );
        expect(Number.isFinite(median(values)), target.id).toBe(true);
      }
    }
  });
});
