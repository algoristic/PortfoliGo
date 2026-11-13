import { EnvironmentProviders, inject, provideAppInitializer, Provider } from '@angular/core';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';

import { SettingsEffects } from './settings.effects';
import { SettingsFacade } from './settings.facade';
import * as fromSettings from './settings.reducer';

import { provideSettingsService } from '../../data-access/service/settings-service.providers';

/**
 * App-wide (TS §11.3): the settings load before the first route, so the colour scheme and the
 * shortcut switch hold from the start. Needs the `ColorSchemeService` and the `ToastService` of
 * `provideAppCore()`.
 */
export function provideSettingsState(): Array<Provider | EnvironmentProviders> {
  return [
    SettingsFacade,
    provideState(fromSettings.SETTINGS_FEATURE_KEY, fromSettings.settingsReducer),
    provideEffects(SettingsEffects),
    provideSettingsService(),
    provideAppInitializer(() => inject(SettingsFacade).init()),
  ];
}
