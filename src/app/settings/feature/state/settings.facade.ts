import { inject, Injectable } from '@angular/core';
import { select, Store } from '@ngrx/store';

import { NotificationChannel } from '@app/notifications/domain/models/notification-channel.model';
import { NotificationCode } from '@app/notifications/domain/models/notification.model';
import { ChangeColorSetting, ColorSchemeSetting } from '@app/settings/domain/models/settings.model';
import { Language } from '@app/shared/util/locale';

import * as SettingsActions from './settings.actions';
import * as SettingsSelectors from './settings.selectors';

@Injectable()
export class SettingsFacade {
  readonly #store = inject(Store);

  colorScheme$ = this.#store.pipe(select(SettingsSelectors.selectColorScheme));
  language$ = this.#store.pipe(select(SettingsSelectors.selectLanguage));
  changeColors$ = this.#store.pipe(select(SettingsSelectors.selectChangeColors));
  priceHighlight$ = this.#store.pipe(select(SettingsSelectors.selectPriceHighlight));
  shortcutsEnabled$ = this.#store.pipe(select(SettingsSelectors.selectShortcutsEnabled));
  /** The stored deviations per channel; the notifications slice decides with them (TS §12). */
  notificationChannels$ = this.#store.pipe(select(SettingsSelectors.selectNotificationChannels));
  effectiveNotificationChannels$ = this.#store.pipe(
    select(SettingsSelectors.selectEffectiveNotificationChannels),
  );

  init(): void {
    this.#store.dispatch(SettingsActions.enterApp());
  }

  selectColorScheme(colorScheme: ColorSchemeSetting): void {
    this.#store.dispatch(SettingsActions.selectedColorScheme({ colorScheme }));
  }

  selectLanguage(language: Language): void {
    this.#store.dispatch(SettingsActions.selectedLanguage({ language }));
  }

  selectChangeColors(changeColors: ChangeColorSetting): void {
    this.#store.dispatch(SettingsActions.selectedChangeColors({ changeColors }));
  }

  setPriceHighlight(enabled: boolean): void {
    this.#store.dispatch(SettingsActions.toggledPriceHighlight({ enabled }));
  }

  setNotificationChannel(
    channel: NotificationChannel,
    code: NotificationCode,
    enabled: boolean,
  ): void {
    this.#store.dispatch(SettingsActions.toggledNotificationChannel({ channel, code, enabled }));
  }

  setShortcutsEnabled(enabled: boolean): void {
    this.#store.dispatch(SettingsActions.toggledShortcuts({ enabled }));
  }
}
