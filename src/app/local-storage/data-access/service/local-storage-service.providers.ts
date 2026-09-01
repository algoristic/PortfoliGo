import { EnvironmentProviders, Provider } from '@angular/core';

import { LocalStorageService } from './local-storage.service';

export function provideLocalStorageService(): Array<Provider | EnvironmentProviders> {
  return [LocalStorageService];
}
