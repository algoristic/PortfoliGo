import { COMPARISON_SEEDS } from '@app/lab/domain/seed-comparison';

// Named seeds of the tests, so that suites don't share seeds by accident (TS §14.1). The golden
// seed lives in `market/domain/golden-master.ts` because the self-test needs it at runtime; the
// calibration seeds are the seeds of the lab's seed comparison.

export const TEST_SEEDS = {
  /** Mini world of the property tests (`world/domain/testing/mini-world.ts`). */
  mini: 'mini-1',
  /** Mini world of the engine scenario „500 € Startkapital“ (AP 7.3c, review 7.1c-01). */
  smallBase: 'mini-2',
  /** Page tests of the lab. */
  page: 'page-test',
  /** Statistical tests on fixed seeds. */
  calibration: COMPARISON_SEEDS,
  /** Many worlds for cross-sectional tests of single instruments (`idio-1` … `idio-20`). */
  crossSection: Array.from({ length: 20 }, (_, n) => `idio-${n + 1}`),
  /** Broad set of fresh seeds for the info run of the calibration (E-34, AP 7.3a). */
  calibrationBroad: Array.from({ length: 20 }, (_, n) => `broad-${n + 1}`),
} as const;
