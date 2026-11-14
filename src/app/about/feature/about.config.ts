import { InjectionToken } from '@angular/core';

/** Version of the app from `package.json`; bootstrap code (`provideAppCore()`) provides it. */
export const APP_VERSION = new InjectionToken<string>('APP_VERSION');
