import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { ApplicationConfig, LOCALE_ID } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideEffects } from '@ngrx/effects';
import { provideRouterStore, routerReducer } from '@ngrx/router-store';
import { provideStore } from '@ngrx/store';
import { provideStoreDevtools } from '@ngrx/store-devtools';

import { routes } from './app.routes';
import { provideColorSchemeService } from './shared/data-access/color-scheme/color-scheme-service.providers';
import { provideToastService } from './shared/ui/toast/toast-service.providers';
import { providePageTitleStrategy } from './shell/feature/page-title/page-title.providers';

import { environment } from '../environments/environment';

registerLocaleData(localeDe);

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withHashLocation()),
    providePageTitleStrategy(),
    provideStore({ router: routerReducer }),
    provideEffects(),
    provideRouterStore(),
    ...(environment.storeDevtools ? [provideStoreDevtools(environment.storeDevtools)] : []),
    { provide: LOCALE_ID, useValue: 'de' },
    provideColorSchemeService(),
    provideToastService(),
  ],
};
