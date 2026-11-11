import { InjectionToken } from '@angular/core';

import { LabWorkerPort } from './lab-simulation-service.model';

/** Creates the lab worker; tests provide a fake instead of a real `Worker`. */
export const LAB_WORKER_FACTORY = new InjectionToken<() => LabWorkerPort>('LAB_WORKER_FACTORY');

export function createLabWorker(): LabWorkerPort {
  return new Worker(new URL('./lab-simulation.worker', import.meta.url), { type: 'module' });
}
