// Named seeds of the tests, so that suites don't share seeds by accident (TS §14.1). The golden
// seed lives in `market/domain/golden-master.ts` because the self-test needs it at runtime.

export const TEST_SEEDS = {
  /** Mini world of the property tests (`world/domain/testing/mini-world.ts`). */
  mini: 'mini-1',
  /** Page tests of the lab. */
  page: 'page-test',
  /** Statistical tests on fixed seeds. */
  calibration: ['calib-1', 'calib-2', 'calib-3', 'calib-4', 'calib-5'],
} as const;
