import { EnvironmentProviders, Provider } from '@angular/core';
import { EngineService } from './engine.service';

export function provideEngineService(): Array<Provider | EnvironmentProviders> {
  return [EngineService];
}
