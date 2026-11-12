import { EnvironmentProviders, Provider } from '@angular/core';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';

import { provideLocalStorageService } from '@app/persistence/data-access/local-storage/local-storage-service.providers';

import { SessionEffects } from './session.effects';
import { SessionFacade } from './session.facade';
import * as fromSession from './session.reducer';

/** Part of `provideGameState()`; the `EngineService` comes from `provideAppCore()` (TS §11.2). */
export function provideSessionState(): Array<Provider | EnvironmentProviders> {
  return [
    SessionFacade,
    provideState(fromSession.SESSION_FEATURE_KEY, fromSession.sessionReducer),
    provideEffects(SessionEffects),
    provideLocalStorageService(),
  ];
}
