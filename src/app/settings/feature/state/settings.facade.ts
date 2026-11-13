import { inject, Injectable } from '@angular/core';
import { select, Store } from '@ngrx/store';

import { ColorSchemeSetting } from '@app/settings/domain/models/settings.model';

import * as SettingsActions from './settings.actions';
import * as SettingsSelectors from './settings.selectors';

@Injectable()
export class SettingsFacade {
  readonly #store = inject(Store);

  colorScheme$ = this.#store.pipe(select(SettingsSelectors.selectColorScheme));
  shortcutsEnabled$ = this.#store.pipe(select(SettingsSelectors.selectShortcutsEnabled));

  init(): void {
    this.#store.dispatch(SettingsActions.enterApp());
  }

  selectColorScheme(colorScheme: ColorSchemeSetting): void {
    this.#store.dispatch(SettingsActions.selectedColorScheme({ colorScheme }));
  }

  setShortcutsEnabled(enabled: boolean): void {
    this.#store.dispatch(SettingsActions.toggledShortcuts({ enabled }));
  }
}
