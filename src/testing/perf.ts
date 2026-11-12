import { appendFileSync } from 'node:fs';

// Performance budgets of TS §14.3, checked only in the perf suite (`*.perf.spec.ts`, run one file
// after the other). CI runners are slower and noisier than the development machine, so CI
// multiplies the budgets with `PERF_FACTOR`; the acceptance of an AP measures locally with 1.

export const PERF_FACTOR = Number(process.env['PERF_FACTOR'] ?? '1');

/** Budgets in milliseconds (TS §14.3). */
export const BUDGETS_MS = {
  /** World generation (AP 1.3). */
  worldGeneration: 200,
  /** Game start: world and prehistory up to 01.04.2030. */
  gameStart: 2_000,
  /** One game year with all minute curves: 15 % of a core at 1 game week per second. */
  gameYearLive: 0.15 * (365.25 / 7) * 1_000,
  /** Minute chart (1D) of any past day, cold caches. */
  minuteChart: 50,
} as const;

/** Median wall time of `runs` calls after `warmUp` calls. */
export function medianMs(fn: () => void, runs = 5, warmUp = 1): number {
  for (let i = 0; i < warmUp; i++) {
    fn();
  }
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}

/** Logs the measurement (and appends it to the CI job summary) and checks it against the budget. */
export function expectWithinBudget(name: string, ms: number, budgetMs: number): void {
  const limit = budgetMs * PERF_FACTOR;
  const line = `${name}: ${ms.toFixed(1)} ms (budget ${budgetMs} ms × ${PERF_FACTOR})`;
  console.info(line);
  const summary = process.env['GITHUB_STEP_SUMMARY'];
  if (summary) {
    appendFileSync(summary, `- ${line}\n`);
  }
  expect(ms, line).toBeLessThanOrEqual(limit);
}
