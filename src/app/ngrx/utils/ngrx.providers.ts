import { EnvironmentProviders, Provider } from '@angular/core';
import { provideStoreDevtools, StoreDevtoolsOptions } from '@ngrx/store-devtools';

export type NgRxDevToolsConfig = 'none' | StoreDevtoolsOptions;

export function provideNgRxDevTools(
  config: NgRxDevToolsConfig,
): Array<Provider | EnvironmentProviders> {
  if (typeof config === 'string') {
    return [];
  }

  return [provideStoreDevtools(config)];
}
