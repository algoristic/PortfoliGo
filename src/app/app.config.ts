import { ApplicationConfig } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { provideStoreDevtools } from '@ngrx/store-devtools';

import { provideAppCore } from './app.providers';
import { routes } from './app.routes';

import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withHashLocation()),
    provideAppCore(),
    // Offline use and update notices (TS §13, E-05); the path is relative to `<base href="./">`.
    provideServiceWorker('ngsw-worker.js', {
      enabled: environment.serviceWorker,
      registrationStrategy: 'registerWhenStable:30000',
    }),
    ...(environment.storeDevtools ? [provideStoreDevtools(environment.storeDevtools)] : []),
  ],
};
