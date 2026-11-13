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

/**
 * Creates the prefix of the command IDs of one `EngineService` (TS §8.5). The engine ignores a
 * command whose ID it already saw in the same tick, so IDs must stay unique across page loads: a
 * reload in the same paused tick would otherwise repeat `1`, `2`, … and lose commands. The default
 * draws a random prefix; the in-process worker of the tests counts deterministically.
 */
export const ENGINE_COMMAND_ID_PREFIX = new InjectionToken<() => string>(
  'ENGINE_COMMAND_ID_PREFIX',
  {
    providedIn: 'root',
    factory: () => randomCommandIdPrefix,
  },
);

/** Twelve hex digits (48 bits) of a random UUID. */
export function randomCommandIdPrefix(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 12);
}

/** Failures in a row after which the service stops restarting the worker (TS §8.5). */
export const MAX_WORKER_FAILURES = 3;
