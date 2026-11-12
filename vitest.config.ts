import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Framework-free specs run in plain Vitest under Node (TS §14.1). Angular-layer specs run through
// `ng test` (angular.json), which excludes the files of these projects.
const longRunning = { testTimeout: 300_000, hookTimeout: 300_000 };
// Logic specs simulate years of the market in the process (e.g. `LabSimulation`); on CI runners some
// take longer than Vitest's default budgets of 5 s per test and 10 s per hook. Same budget as `angular`.
const simulating = { testTimeout: 30_000, hookTimeout: 60_000 };

export default defineConfig({
  resolve: {
    alias: { '@app': fileURLToPath(new URL('./src/app', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['src/testing/logic-setup.ts'],
    projects: [
      {
        extends: true,
        test: {
          name: 'logic',
          include: ['src/app/*/{domain,util}/**/*.spec.ts'],
          exclude: ['**/*.calibration.spec.ts', '**/*.perf.spec.ts'],
          ...simulating,
        },
      },
      {
        extends: true,
        test: {
          name: 'calibration',
          include: ['src/app/**/*.calibration.spec.ts'],
          ...longRunning,
        },
      },
      {
        extends: true,
        test: {
          name: 'perf',
          include: ['src/app/**/*.perf.spec.ts'],
          fileParallelism: false,
          ...longRunning,
        },
      },
    ],
  },
});
