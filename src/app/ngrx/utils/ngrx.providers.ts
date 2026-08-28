import { EnvironmentProviders, Provider } from '@angular/core';
import { provideStoreDevtools, StoreDevtoolsOptions } from '@ngrx/store-devtools';

export type NgRxDevToolsConfig = false | StoreDevtoolsOptions;

export function provideNgRxDevTools(
  config: NgRxDevToolsConfig,
): Array<Provider | EnvironmentProviders> {
  if (typeof config === 'boolean') {
    return [];
  }

  return [provideStoreDevtools(config)];
}
