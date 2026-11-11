/// <reference lib="webworker" />

import { LabWorkerRequest } from './lab-simulation-service.model';
import { LabWorkerSession } from './lab-worker-session';

const session = new LabWorkerSession(() => performance.now());

addEventListener('message', ({ data }: MessageEvent<LabWorkerRequest>) => {
  postMessage(session.handle(data));
});
