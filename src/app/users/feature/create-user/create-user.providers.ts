import { EnvironmentProviders, Provider } from '@angular/core';

import { CREATE_USER_CONFIG, CreateUserConfig } from './create-user.config';

export function provideNewUserSettings(
  config: CreateUserConfig,
): Array<Provider | EnvironmentProviders> {
  return [
    {
      provide: CREATE_USER_CONFIG,
      useValue: config,
    },
  ];
}
