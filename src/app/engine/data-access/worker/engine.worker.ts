/// <reference lib="webworker" />

import { EngineHost } from './engine-host';
import { InMemoryEngineStorage } from './in-memory-engine-storage';

const host = new EngineHost({
  now: () => Date.now(),
  post: (message) => postMessage(message),
  timer: {
    set: (callback, delayMs) => setTimeout(callback, delayMs),
    clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
  storage: new InMemoryEngineStorage(),
});

addEventListener('message', ({ data }: MessageEvent<unknown>) => {
  void host.receive(data);
});
