import { EnvironmentProviders, inject, provideAppInitializer, Provider } from '@angular/core';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';

import { PwaEffects } from './pwa.effects';
import { PwaFacade } from './pwa.facade';
import * as fromPwa from './pwa.reducer';

/**
 * App-wide (TS §11.3, §13): starts at once, so the installation dialog of the browser and the
 * notices of the service worker are caught from the start. Needs the `ToastService` of
 * `provideAppCore()`.
 */
export function providePwaState(): Array<Provider | EnvironmentProviders> {
  return [
    PwaFacade,
    provideState(fromPwa.PWA_FEATURE_KEY, fromPwa.pwaReducer),
    provideEffects(PwaEffects),
    provideAppInitializer(() => inject(PwaFacade).init()),
  ];
}
