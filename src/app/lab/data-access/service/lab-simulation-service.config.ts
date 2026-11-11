import { InjectionToken } from '@angular/core';

import { LabWorkerPort } from './lab-simulation-service.model';

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
