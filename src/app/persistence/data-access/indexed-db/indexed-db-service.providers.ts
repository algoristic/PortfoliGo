import { EnvironmentProviders, Provider } from '@angular/core';

import { IndexedDbService } from './indexed-db.service';

export function provideIndexedDbService(): Array<Provider | EnvironmentProviders> {
  return [IndexedDbService];
}
