import { EnvironmentProviders, Provider } from '@angular/core';

import { provideLocalStorageService } from '@app/persistence/data-access/local-storage/local-storage-service.providers';

import { SettingsService } from './settings.service';

export function provideSettingsService(): Array<Provider | EnvironmentProviders> {
  return [SettingsService, provideLocalStorageService()];
}
