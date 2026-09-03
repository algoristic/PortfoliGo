import { EnvironmentProviders, Provider } from '@angular/core';
import { LandingFacade } from './landing.facade';
import { provideEffects } from '@ngrx/effects';
import { LandingEffects } from './landing.effects';

export function provideLandingState(): Array<Provider | EnvironmentProviders> {
  return [LandingFacade, provideEffects(LandingEffects)];
}
