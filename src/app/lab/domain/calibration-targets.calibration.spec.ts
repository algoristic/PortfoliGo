import { median } from '@app/analysis/domain/statistics-logic';

import {
  CALIBRATION_TARGETS,
  CalibrationTarget,
  LONG_TERM_LIMIT_YEARS,
  LONG_TERM_LIMITS,
  LongTermLimit,
} from './calibration-targets';
import {
  calibrationReport,
  CalibrationRun,
  checkpointOf as checkpoint,
  measureCalibrationRun as measure,
  measuredOverLongRun,
  PREHISTORY_TARGET_YEARS,
  targetValue,
  windowOf as window,
} from './testing/calibration-run';

import { TEST_SEEDS } from '../../../testing/seeds';

// Calibration targets of TS §6.9 under the rule of E-34 as extended (AP 7.3e, 7.1b-03): every
// target with a band lies in it in the median of the 20 fresh seeds `broad-1` … `broad-20`; single
// seeds may deviate, the bands hold for a typical seed. Targets with a minimum period of up to ten
// years are checked over the prehistory from the epoch and again over the long run (epoch to 100
// years after the game start), the others (return, bear markets) over the long run only. The
// long-term limits (E-22) hold at the checkpoints and in the rolling windows of the long run.
// Targets and limits marked `openUntil` (E-39) are reported, not checked, until that decision.

/** Prehistory, 100 years and the statistics of both take about 20 s per seed. */
const RUN_TIMEOUT = 1_800_000;

function expectWithinLimit(
  label: string,
  values: number[],
  limit: Pick<LongTermLimit, 'min' | 'max' | 'openUntil'>,
): void {
  const value = median(values);
  const message = `${label}: median ${value} of ${values.join(' / ')}`;
  expect(Number.isFinite(value), message).toBe(true);
  if (limit.openUntil !== undefined) {
    const band = `${limit.min ?? ''}…${limit.max ?? ''}`;
    console.info(`open until ${limit.openUntil} (E-39): ${message}, band ${band}`);
    return;
  }
  if (limit.min !== undefined) {
    expect(value, message).toBeGreaterThanOrEqual(limit.min);
  }
  if (limit.max !== undefined) {
    expect(value, message).toBeLessThanOrEqual(limit.max);
  }
}

const BANDED_TARGETS = (CALIBRATION_TARGETS as readonly CalibrationTarget[]).filter(
  (target) => target.min !== undefined || target.max !== undefined,
);

const PREHISTORY_TARGETS = BANDED_TARGETS.filter((target) => !measuredOverLongRun(target));

describe('calibration targets on the broad seed set (TS §6.9, E-34)', () => {
  let runs: CalibrationRun[];

  beforeAll(() => {
    runs = TEST_SEEDS.calibrationBroad.map(measure);
  }, RUN_TIMEOUT);

  it('measures at least 20 fresh seeds', () => {
    expect(runs.length).toBeGreaterThanOrEqual(20);
  });

  it.each(PREHISTORY_TARGETS.map((target) => [target.id, target] as const))(
    'keeps %s in its band in the median over the prehistory',
    (id, target) => {
      const values = runs.map((run) => {
        expect(run.prehistory.years).toBeGreaterThanOrEqual(target.minYears ?? 0);
        expect(target.minYears ?? 0).toBeLessThanOrEqual(PREHISTORY_TARGET_YEARS);
        return targetValue(run.prehistory, id);
      });
      expectWithinLimit(`${id} (prehistory)`, values, target);
    },
  );

  it.each(BANDED_TARGETS.map((target) => [target.id, target] as const))(
    'keeps %s in its band in the median over the long run',
    (id, target) => {
      const values = runs.map((run) => {
        expect(run.long.years).toBeGreaterThanOrEqual(target.minYears ?? 0);
        return targetValue(run.long, id);
      });
      expectWithinLimit(`${id} (long run)`, values, target);
    },
  );

  describe.each(LONG_TERM_LIMIT_YEARS)('%i game years after the start (E-22)', (years) => {
    it('keeps the five largest values within their limit of the world index', () => {
      expectWithinLimit(
        `top five after ${years} years`,
        runs.map((run) => checkpoint(run, years)?.topFiveShare ?? Number.NaN),
        LONG_TERM_LIMITS.topFiveShare,
      );
    });

    it('keeps the shares below 1 € and at the price floor within their limits', () => {
      expectWithinLimit(
        `below 1 € after ${years} years`,
        runs.map((run) => checkpoint(run, years)?.belowOneEuro.all ?? Number.NaN),
        LONG_TERM_LIMITS.belowOneEuro,
      );
      expectWithinLimit(
        `at the floor after ${years} years`,
        runs.map((run) => checkpoint(run, years)?.atFloor ?? Number.NaN),
        LONG_TERM_LIMITS.atFloor,
      );
    });
  });

  it('keeps the median volatility of the rolling windows within its limit (E-22)', () => {
    const { windowVolatility } = LONG_TERM_LIMITS;
    expectWithinLimit(
      `volatility of the ${windowVolatility.years}-year windows`,
      runs.map((run) => window(run, windowVolatility.years)?.volatility.median ?? Number.NaN),
      windowVolatility,
    );
  });

  it('keeps the median dividend yield of the rolling windows within its limit (E-22)', () => {
    const { windowDividendYield } = LONG_TERM_LIMITS;
    expectWithinLimit(
      `dividend yield of the ${windowDividendYield.years}-year windows`,
      runs.map((run) => window(run, windowDividendYield.years)?.dividendYield.median ?? Number.NaN),
      windowDividendYield,
    );
  });

  it('reports the info rows and long-term measures of the seeds', () => {
    console.info(calibrationReport('Broad seed set', runs));
    expect(runs).toHaveLength(TEST_SEEDS.calibrationBroad.length);
  });
});
