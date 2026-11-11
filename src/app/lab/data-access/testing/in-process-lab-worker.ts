import { inject, PendingTasks, Provider } from '@angular/core';

import { LAB_WORKER_FACTORY } from '../service/lab-simulation-service.config';
import {
  LabWorkerPort,
  LabWorkerRequest,
  LabWorkerResponse,
} from '../service/lab-simulation-service.model';
import { LabWorkerSession } from '../service/lab-worker-session';

/**
 * The lab worker without a thread, for page tests: the same `LabWorkerSession` as in the worker.
 * Messages are copied like `postMessage` does and answered in a later task. Every open request is
 * an Angular pending task, so `fixture.whenStable()` waits for the answer and what follows it.
 */
export class InProcessLabWorker implements LabWorkerPort {
  readonly #session: LabWorkerSession;
  readonly #pendingTasks: PendingTasks;
  readonly #listeners: Array<(event: MessageEvent<LabWorkerResponse>) => void> = [];
  #terminated = false;

  constructor(session: LabWorkerSession, pendingTasks: PendingTasks) {
    this.#session = session;
    this.#pendingTasks = pendingTasks;
  }

  postMessage(message: LabWorkerRequest): void {
    const request = structuredClone(message);
    const done = this.#pendingTasks.add();
    setTimeout(() => {
      try {
        if (!this.#terminated) {
          const event = new MessageEvent('message', {
            data: structuredClone(this.#session.handle(request)),
          });
          this.#listeners.forEach((listener) => listener(event));
        }
      } finally {
        done();
      }
    });
  }

  addEventListener(
    _type: 'message',
    listener: (event: MessageEvent<LabWorkerResponse>) => void,
  ): void {
    this.#listeners.push(listener);
  }

  terminate(): void {
    this.#terminated = true;
  }
}

/**
 * Replaces the real worker with an `InProcessLabWorker` (provide it at the root injector). Every
 * clock reading advances by 10 ms, so the shown durations are deterministic.
 */
export function provideInProcessLabWorker(): Provider {
  return {
    provide: LAB_WORKER_FACTORY,
    useFactory: () => {
      const pendingTasks = inject(PendingTasks);
      let time = 0;
      const clock = (): number => (time += 10);
      return () => new InProcessLabWorker(new LabWorkerSession(clock), pendingTasks);
    },
  };
}
