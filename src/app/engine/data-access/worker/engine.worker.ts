/// <reference lib="webworker" />

import { WebPlayerLocks } from '@app/persistence/data-access/locks/player-locks';

import { EngineHost } from './engine-host';
import { IndexedDbEngineStorage } from './indexed-db-engine-storage';

import { version } from '../../../../../package.json';

const host = new EngineHost(
  {
    now: () => Date.now(),
    post: (message) => postMessage(message),
    timer: {
      set: (callback, delayMs) => setTimeout(callback, delayMs),
      clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
    storage: new IndexedDbEngineStorage(),
    locks: new WebPlayerLocks(navigator.locks),
  },
  { appVersion: version },
);

addEventListener('message', ({ data }: MessageEvent<unknown>) => {
  void host.receive(data);
});
