import { median } from '@app/analysis/domain/statistics-logic';

import {
  CALIBRATION_TARGETS,
  CalibrationTarget,
  LONG_TERM_LIMIT_YEARS,
  LONG_TERM_LIMITS,
  LongTermLimit,
} from './calibration-targets';
import { LabSimulation } from './lab-simulation';
import { LabStatistics, LongTermCheckpoint, RollingWindows } from './models/lab-statistics.model';
import { COMPARISON_YEARS } from './seed-comparison';

import { TEST_SEEDS } from '../../../testing/seeds';

// Calibration targets of TS §6.9 on the calibration seeds (AP 1.9c): every target with a band lies
// in it in the median of `calib-1` … `calib-5`; single seeds may deviate. Targets with a minimum
// period of up to ten years are measured over the prehistory from the epoch, the others (return,
// bear markets) from the epoch to 100 years after the game start. The long-term limits (E-22) hold
// at the checkpoints and in the rolling windows of the same long run.

/** Longest minimum period of a target that the prehistory (about 10.25 years) can measure. */
const PREHISTORY_TARGET_YEARS = 10;
/** Prehistory, 100 years and the statistics of both take about 20 s per seed. */
const RUN_TIMEOUT = 600_000;

interface CalibrationRun {
  prehistory: LabStatistics;
  long: LabStatistics;
}

/** The lab's statistics of a seed after the prehistory and 100 years after the game start. */
function measure(seed: string): CalibrationRun {
  const simulation = new LabSimulation(seed);
  simulation.runPrehistory();
  const prehistory = simulation.statistics('epoch');
  simulation.simulateYears(COMPARISON_YEARS);
  return { prehistory, long: simulation.statistics('epoch') };
}

function expectWithinLimit(
  label: string,
  values: number[],
  limit: Pick<LongTermLimit, 'min' | 'max'>,
): void {
  const value = median(values);
  const message = `${label}: median ${value} of ${values.join(' / ')}`;
  expect(Number.isFinite(value), message).toBe(true);
  if (limit.min !== undefined) {
    expect(value, message).toBeGreaterThanOrEqual(limit.min);
  }
  if (limit.max !== undefined) {
    expect(value, message).toBeLessThanOrEqual(limit.max);
  }
}

function checkpoint(run: CalibrationRun, years: number): LongTermCheckpoint | undefined {
  return run.long.longTerm.checkpoints.find((entry) => entry.years === years);
}

function window(run: CalibrationRun, years: number | undefined): RollingWindows | undefined {
  return run.long.longTerm.windows.find((entry) => entry.years === years);
}

const BANDED_TARGETS = (CALIBRATION_TARGETS as readonly CalibrationTarget[]).filter(
  (target) => target.min !== undefined || target.max !== undefined,
);

describe('calibration targets (TS §6.9)', () => {
  let runs: CalibrationRun[];

  beforeAll(() => {
    runs = TEST_SEEDS.calibration.map(measure);
  }, RUN_TIMEOUT);

  it.each(BANDED_TARGETS.map((target) => [target.id, target] as const))(
    'keeps %s in its band in the median of the seeds',
    (id, target) => {
      const long = (target.minYears ?? 0) > PREHISTORY_TARGET_YEARS;
      const values = runs.map((run) => {
        const statistics = long ? run.long : run.prehistory;
        expect(statistics.years).toBeGreaterThanOrEqual(target.minYears ?? 0);
        return statistics.targets.find((row) => row.id === id)?.value ?? Number.NaN;
      });
      expectWithinLimit(id, values, target);
    },
  );

  describe.each(LONG_TERM_LIMIT_YEARS)('%i game years after the start (E-22)', (years) => {
    it('keeps the five largest values within their limit of the world index', () => {
      expectWithinLimit(
        'top five',
        runs.map((run) => checkpoint(run, years)?.topFiveShare ?? Number.NaN),
        LONG_TERM_LIMITS.topFiveShare,
      );
    });

    it('keeps the shares below 1 € and at the price floor within their limits', () => {
      expectWithinLimit(
        'below 1 €',
        runs.map((run) => checkpoint(run, years)?.belowOneEuro.all ?? Number.NaN),
        LONG_TERM_LIMITS.belowOneEuro,
      );
      expectWithinLimit(
        'at the floor',
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
});
