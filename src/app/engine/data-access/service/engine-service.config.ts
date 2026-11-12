import { InjectionToken } from '@angular/core';

import { EngineWorkerPort } from './engine-service.model';

/**
 * Creates the engine worker. The default starts a real `Worker`; tests provide an in-process worker
 * at the root injector (`provideInProcessEngineWorker()`), which is why the token has a root
 * default instead of being part of `provideEngineService()`.
 */
export const ENGINE_WORKER_FACTORY = new InjectionToken<() => EngineWorkerPort>(
  'ENGINE_WORKER_FACTORY',
  {
    providedIn: 'root',
    factory: () => createEngineWorker,
  },
);

export function createEngineWorker(): EngineWorkerPort {
  return new Worker(new URL('../worker/engine.worker', import.meta.url), { type: 'module' });
}

/** Failures in a row after which the service stops restarting the worker (TS §8.5). */
export const MAX_WORKER_FAILURES = 3;
