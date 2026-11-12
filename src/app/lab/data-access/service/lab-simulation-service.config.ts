import { InjectionToken } from '@angular/core';

import { LabWorkerPort } from './lab-simulation-service.model';

import { COMPARISON_SEEDS, COMPARISON_YEARS } from '../../domain/seed-comparison';

/**
 * Creates the lab worker. The default starts a real `Worker`; tests provide an in-process worker
 * at the root injector, which is why the token is not part of the route providers.
 */
export const LAB_WORKER_FACTORY = new InjectionToken<() => LabWorkerPort>('LAB_WORKER_FACTORY', {
  providedIn: 'root',
  factory: () => createLabWorker,
});

export function createLabWorker(): LabWorkerPort {
  return new Worker(new URL('./lab-simulation.worker', import.meta.url), { type: 'module' });
}

export interface LabSeedComparisonConfig {
  seeds: readonly string[];
  /** Game years after the game start per seed. */
  years: number;
}

/** Seeds and length of the seed comparison; page tests provide a shorter one at the root. */
export const LAB_SEED_COMPARISON = new InjectionToken<LabSeedComparisonConfig>(
  'LAB_SEED_COMPARISON',
  {
    providedIn: 'root',
    factory: () => ({ seeds: COMPARISON_SEEDS, years: COMPARISON_YEARS }),
  },
);
