import { Provider } from '@angular/core';

import { APP_RELOAD, AppReloadPort } from '../app-reload/app-reload';

/** Counts the reloads instead of reloading; provide it with `provideRecordingAppReload`. */
export class RecordingAppReload implements AppReloadPort {
  reloads = 0;

  reload(): void {
    this.reloads++;
  }
}

/** Replaces the reload port at the root injector (page tests). */
export function provideRecordingAppReload(reload: RecordingAppReload): Provider {
  return { provide: APP_RELOAD, useValue: reload };
}
