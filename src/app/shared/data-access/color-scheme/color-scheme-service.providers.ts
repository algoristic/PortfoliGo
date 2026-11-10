import { EnvironmentProviders, inject, provideAppInitializer, Provider } from '@angular/core';

import { ColorSchemeService } from './color-scheme.service';

export function provideColorSchemeService(): Array<Provider | EnvironmentProviders> {
  return [ColorSchemeService, provideAppInitializer(() => inject(ColorSchemeService).init())];
}
