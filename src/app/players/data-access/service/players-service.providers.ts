import { EnvironmentProviders, Provider } from '@angular/core';

import { provideLocalStorageService } from '@app/persistence/data-access/local-storage/local-storage-service.providers';

import { PlayersService } from './players.service';

export function providePlayersService(): Array<Provider | EnvironmentProviders> {
  return [PlayersService, provideLocalStorageService()];
}
