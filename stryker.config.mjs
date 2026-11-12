// @ts-check
// Mutation tests measure whether the tests of rule code find plausible bugs (TS §14.1). Market
// models, world generation and the RNG are protected by golden masters instead; det-math consists
// of fdlibm constants whose mutants are mostly equivalent.

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  vitest: { configFile: 'vitest.mutation.config.ts' },
  mutate: [
    'src/app/shared/domain/money-logic.ts',
    'src/app/shared/domain/price-step-logic.ts',
    'src/app/clock/domain/calendar-logic.ts',
    'src/app/clock/domain/clock-logic.ts',
    'src/app/clock/domain/trading-hours-logic.ts',
    'src/app/analysis/domain/statistics-logic.ts',
    'src/app/analysis/domain/drawdown-logic.ts',
    'src/app/market/domain/dividend-logic.ts',
    'src/app/market/domain/candle-logic.ts',
    'src/app/market/domain/price-logic.ts',
    'src/app/market/domain/index-layout.ts',
    'src/app/market/domain/idio-path-logic.ts',
    'src/app/market/domain/market-calendar.ts',
    'src/app/lab/domain/calibration-targets.ts',
    'src/app/engine/domain/scheduler.ts',
    'src/app/engine/domain/game-engine.ts',
    'src/app/engine/domain/game-world.ts',
    'src/app/engine/domain/replay.ts',
  ],
  coverageAnalysis: 'perTest',
  ignoreStatic: true,
  incremental: true,
  incrementalFile: 'reports/mutation/incremental.json',
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  // Build output and test artefacts change while other tools run; they don't belong in the sandbox.
  ignorePatterns: [
    '/www',
    '/test-results',
    '/playwright-report',
    '/blob-report',
    '/reports',
    '/.angular',
    '/.playwright-mcp',
    '/e2e',
    '/out-tsc',
  ],
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
  // `break`: baseline of AP 0.5 (94.6 %) minus 3 points (TS §14.1).
  thresholds: { high: 95, low: 85, break: 91 },
};

export default config;
