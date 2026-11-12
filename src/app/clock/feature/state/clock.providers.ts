import { EnvironmentProviders, Provider } from '@angular/core';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';

import { ClockEffects } from './clock.effects';
import { ClockFacade } from './clock.facade';
import * as fromClock from './clock.reducer';

/** Part of `provideGameState()`; the `EngineService` comes from `provideAppCore()` (TS §11.2). */
export function provideClockState(): Array<Provider | EnvironmentProviders> {
  return [
    ClockFacade,
    provideState(fromClock.CLOCK_FEATURE_KEY, fromClock.clockReducer),
    provideEffects(ClockEffects),
  ];
}
