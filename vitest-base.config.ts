import { defineConfig } from 'vitest/config';

// Base config of the `angular` suite (`ng test`, `runnerConfig` in angular.json). Page tests run the
// real worker code in the test process (TS §14.1); on CI runners a ten-year simulation takes longer
// than Vitest's default budgets of 5 s per test and 10 s per hook.
export default defineConfig({
  test: { testTimeout: 30_000, hookTimeout: 60_000 },
});
