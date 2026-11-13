import { EnvironmentProviders, Provider } from '@angular/core';

import { ColorSchemeService } from './color-scheme.service';

/** The settings slice applies the chosen colour scheme (`provideSettingsState()`, AP 2.6). */
export function provideColorSchemeService(): Array<Provider | EnvironmentProviders> {
  return [ColorSchemeService];
}
