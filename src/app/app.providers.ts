import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import { EnvironmentProviders, LOCALE_ID, Provider } from '@angular/core';
import { provideEffects } from '@ngrx/effects';
import { provideRouterStore, routerReducer } from '@ngrx/router-store';
import { provideStore } from '@ngrx/store';

import { provideColorSchemeService } from '@app/shared/data-access/color-scheme/color-scheme-service.providers';
import { provideToastService } from '@app/shared/ui/toast/toast-service.providers';
import { providePageTitleStrategy } from '@app/shell/feature/page-title/page-title.providers';

registerLocaleData(localeDe);

/**
 * App-wide providers besides the router configuration and the devtools. Page tests use the same
 * providers as the app, so they run against the real store, locale and services.
 */
export function provideAppCore(): Array<Provider | EnvironmentProviders> {
  return [
    providePageTitleStrategy(),
    provideStore({ router: routerReducer }),
    provideEffects(),
    provideRouterStore(),
    { provide: LOCALE_ID, useValue: 'de' },
    provideColorSchemeService(),
    provideToastService(),
  ];
}
