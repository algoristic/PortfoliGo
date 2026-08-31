import { EnvironmentProviders, Provider } from '@angular/core';

import { IdbStorage, INDEXED_DB_CONFIG, IndexedDbConfig } from './idb.config';
import { IndexedDbService } from './idb.service';

export type IndexedDbFeature = (config: IndexedDbConfig) => void;

export function withStorage(idbStorage: IdbStorage): IndexedDbFeature {
  return (config) => {
    config.databaseStorages.push(idbStorage);
  };
}

export function provideIndexedDb(
  config: IndexedDbConfig,
  ...features: IndexedDbFeature[]
): Array<Provider | EnvironmentProviders> {
  features.forEach((feature) => feature(config));
  return [
    IndexedDbService,
    {
      provide: INDEXED_DB_CONFIG,
      useValue: config,
    },
  ];
}
