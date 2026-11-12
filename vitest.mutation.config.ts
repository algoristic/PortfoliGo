import { mergeConfig } from 'vitest/config';

import base from './vitest.config';

// Mutation tests (Stryker) run only the rule specs of the mutated modules (TS §14.1). Without this
// list Vitest would also run every spec that imports a mutated module, including the slow market
// specs. A fixed fast-check seed keeps the result of a mutant reproducible.
const RULE_SPECS = [
  'src/app/shared/domain/money-logic.spec.ts',
  'src/app/shared/domain/price-step-logic.spec.ts',
  'src/app/clock/domain/calendar-logic.spec.ts',
  'src/app/clock/domain/clock-logic.spec.ts',
  'src/app/clock/domain/trading-hours-logic.spec.ts',
  'src/app/analysis/domain/statistics-logic.spec.ts',
  'src/app/analysis/domain/drawdown-logic.spec.ts',
  'src/app/market/domain/dividend-logic.spec.ts',
  'src/app/market/domain/candle-logic.spec.ts',
  'src/app/market/domain/price-logic.spec.ts',
  'src/app/market/domain/index-layout.spec.ts',
  'src/app/lab/domain/calibration-targets.spec.ts',
];

export default mergeConfig(
  { ...base, test: { ...base.test, projects: undefined } },
  {
    test: {
      include: RULE_SPECS,
      env: { FC_SEED: '20261112', FC_NUM_RUNS: '30' },
    },
  },
);
