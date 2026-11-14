import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import localeEnGb from '@angular/common/locales/en-GB';
import { EnvironmentProviders, inject, LOCALE_ID, Provider } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { provideEffects } from '@ngrx/effects';
import { provideRouterStore, routerReducer } from '@ngrx/router-store';
import { provideStore } from '@ngrx/store';

import { APP_VERSION } from '@app/about/feature/about.config';
import { CLOCK_SHORTCUTS_ENABLED } from '@app/clock/feature/state/clock.config';
import { provideEngineService } from '@app/engine/data-access/service/engine-service.providers';
import { NOTIFICATION_CHANNEL_SETTINGS } from '@app/notifications/feature/state/notifications.config';
import { providePlayersState } from '@app/players/feature/state/players.providers';
import { providePwaState } from '@app/pwa/feature/state/pwa.providers';
import { SettingsFacade } from '@app/settings/feature/state/settings.facade';
import { provideSettingsState } from '@app/settings/feature/state/settings.providers';
import { provideColorSchemeService } from '@app/shared/data-access/color-scheme/color-scheme-service.providers';
import { provideToastService } from '@app/shared/ui/toast/toast-service.providers';
import { VALUE_FLASH_ENABLED } from '@app/shared/ui/value-flash/value-flash.config';
import { formatLanguage, Language } from '@app/shared/util/locale';
import { providePageTitleStrategy } from '@app/shell/feature/page-title/page-title.providers';

import { version } from '../../package.json';

// Angular's locale per language (TS §11.9, E-36): the language `main.ts` set before the start.
registerLocaleData(localeDe);
registerLocaleData(localeEnGb);
const LOCALE_IDS: Record<Language, string> = { de: 'de', en: 'en-GB' };

/**
 * App-wide providers besides the router configuration and the devtools. Page tests use the same
 * providers as the app, so they run against the real store, locale and services.
 */
export function provideAppCore(): Array<Provider | EnvironmentProviders> {
  return [
    providePageTitleStrategy(),
    provideStore({ router: routerReducer }),
    provideEffects(),
    provideRouterStore(),
    { provide: LOCALE_ID, useFactory: () => LOCALE_IDS[formatLanguage()] },
    { provide: APP_VERSION, useValue: version },
    provideColorSchemeService(),
    provideToastService(),
    provideEngineService(),
    providePlayersState(),
    provideSettingsState(),
    providePwaState(),
    {
      provide: CLOCK_SHORTCUTS_ENABLED,
      useFactory: () => inject(SettingsFacade).shortcutsEnabled$,
    },
    {
      provide: NOTIFICATION_CHANNEL_SETTINGS,
      useFactory: () => inject(SettingsFacade).notificationChannels$,
    },
    {
      provide: VALUE_FLASH_ENABLED,
      useFactory: () => toSignal(inject(SettingsFacade).priceHighlight$, { initialValue: true }),
    },
  ];
}
