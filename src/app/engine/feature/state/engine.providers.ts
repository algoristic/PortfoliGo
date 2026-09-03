import { EnvironmentProviders, Provider } from '@angular/core';
import { provideEngineService } from '../../data-access/service/engine-service.providers';
import { provideEffects } from '@ngrx/effects';
import { EngineEffects } from './engine.effects';

export function provideEngine(): Array<Provider | EnvironmentProviders> {
  return [provideEngineService(), provideEffects(EngineEffects)];
}
