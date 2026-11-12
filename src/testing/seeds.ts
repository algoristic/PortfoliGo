import { COMPARISON_SEEDS } from '@app/lab/domain/seed-comparison';

// Named seeds of the tests, so that suites don't share seeds by accident (TS §14.1). The golden
// seed lives in `market/domain/golden-master.ts` because the self-test needs it at runtime; the
// calibration seeds are the seeds of the lab's seed comparison.

export const TEST_SEEDS = {
  /** Mini world of the property tests (`world/domain/testing/mini-world.ts`). */
  mini: 'mini-1',
  /** Page tests of the lab. */
  page: 'page-test',
  /** Statistical tests on fixed seeds. */
  calibration: COMPARISON_SEEDS,
} as const;
