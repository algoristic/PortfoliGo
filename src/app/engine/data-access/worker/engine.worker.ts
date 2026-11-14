/// <reference lib="webworker" />

import { WebPlayerLocks } from '@app/persistence/data-access/locks/player-locks';

import { EngineHost } from './engine-host';
import { IndexedDbEngineStorage } from './indexed-db-engine-storage';

import { version } from '../../../../../package.json';

// A macrotask without the clamping of nested `setTimeout` calls: an import yields between its
// slices of the history run (TS §10.3), so that other messages and the loop run.
const yieldChannel = new MessageChannel();
const yielded: (() => void)[] = [];
yieldChannel.port1.onmessage = () => yielded.shift()?.();

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
    yieldToEvents: () =>
      new Promise((resolve) => {
        yielded.push(resolve);
        yieldChannel.port2.postMessage(null);
      }),
  },
  { appVersion: version },
);

addEventListener('message', ({ data }: MessageEvent<unknown>) => {
  void host.receive(data);
});
