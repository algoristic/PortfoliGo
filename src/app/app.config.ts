import { ApplicationConfig } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideStoreDevtools } from '@ngrx/store-devtools';

import { provideAppCore } from './app.providers';
import { routes } from './app.routes';

import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withHashLocation()),
    provideAppCore(),
    ...(environment.storeDevtools ? [provideStoreDevtools(environment.storeDevtools)] : []),
  ],
};
