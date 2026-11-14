import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { concatLatestFrom } from '@ngrx/operators';
import { select, Store } from '@ngrx/store';
import { catchError, concatMap, ignoreElements, map, of, switchMap, tap } from 'rxjs';

import { isQuotaExceeded } from '@app/persistence/util/quota';
import { APP_RELOAD } from '@app/shared/data-access/app-reload/app-reload';
import { ColorSchemeService } from '@app/shared/data-access/color-scheme/color-scheme.service';
import { ToastService } from '@app/shared/ui/toast/toast.service';

import * as SettingsActions from './settings.actions';
import * as SettingsSelectors from './settings.selectors';

import { SettingsService } from '../../data-access/service/settings.service';

@Injectable()
export class SettingsEffects {
  readonly #actions$ = inject(Actions);
  readonly #store = inject(Store);
  readonly #settingsService = inject(SettingsService);
  readonly #colorSchemeService = inject(ColorSchemeService);
  readonly #toastService = inject(ToastService);
  readonly #appReload = inject(APP_RELOAD);

  loadSettings$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(SettingsActions.enterApp),
      switchMap(() =>
        this.#settingsService.load().pipe(
          map((settings) => SettingsActions.loadedSettings({ settings })),
          catchError((error: unknown) => of(SettingsActions.loadSettingsFailure({ error }))),
        ),
      ),
    ),
  );

  /** Every change is saved at once; the page has no save button. */
  saveSettings$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(
        SettingsActions.selectedColorScheme,
        SettingsActions.selectedChangeColors,
        SettingsActions.toggledPriceHighlight,
        SettingsActions.toggledShortcuts,
        SettingsActions.toggledNotificationChannel,
      ),
      concatLatestFrom(() => this.#store.pipe(select(SettingsSelectors.selectSettings))),
      concatMap(([, settings]) =>
        this.#settingsService.save(settings).pipe(
          ignoreElements(),
          catchError((error: unknown) => of(SettingsActions.saveSettingsFailure({ error }))),
        ),
      ),
    ),
  );

  /**
   * A new language needs a new start (TS §11.9): `main.ts` loads its translations before the app.
   * The app reloads only once the setting is saved; otherwise the failure toast explains it.
   */
  saveLanguage$ = createEffect(() =>
    this.#actions$.pipe(
      ofType(SettingsActions.selectedLanguage),
      concatLatestFrom(() => this.#store.pipe(select(SettingsSelectors.selectSettings))),
      concatMap(([, settings]) =>
        this.#settingsService.save(settings).pipe(
          map(() => SettingsActions.saveLanguageSuccess()),
          catchError((error: unknown) => of(SettingsActions.saveSettingsFailure({ error }))),
        ),
      ),
    ),
  );

  reloadForLanguage$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(SettingsActions.saveLanguageSuccess),
        tap(() => this.#appReload.reload()),
      ),
    { dispatch: false },
  );

  /** Takes over the `dark` class from the inline script in `src/index.html` (TS §11.5). */
  applyColorScheme$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(
          SettingsActions.loadedSettings,
          SettingsActions.loadSettingsFailure,
          SettingsActions.selectedColorScheme,
        ),
        concatLatestFrom(() => this.#store.pipe(select(SettingsSelectors.selectColorScheme))),
        tap(([, colorScheme]) => this.#colorSchemeService.apply(colorScheme)),
      ),
    { dispatch: false },
  );

  /** Takes over the class of the gain and loss colours from `src/index.html` (PS US-UI-02). */
  applyChangeColors$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(
          SettingsActions.loadedSettings,
          SettingsActions.loadSettingsFailure,
          SettingsActions.selectedChangeColors,
        ),
        concatLatestFrom(() => this.#store.pipe(select(SettingsSelectors.selectChangeColors))),
        tap(([, changeColors]) => this.#colorSchemeService.applyChangeColors(changeColors)),
      ),
    { dispatch: false },
  );

  showSaveFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(SettingsActions.saveSettingsFailure),
        tap(({ error }) =>
          this.#toastService.error(
            isQuotaExceeded(error)
              ? $localize`:@@featureSettings-settingsEffects-saveFailureStorageFull:Die Einstellung gilt nur bis zum Neuladen, weil der Speicher voll ist. Exportiere deinen Spielstand und lösche alte Spieler; den belegten Speicher zeigen die Einstellungen unter „App“.`
              : $localize`:@@featureSettings-settingsEffects-saveFailure:Die Einstellung gilt nur bis zum Neuladen, weil sie auf diesem Gerät nicht gespeichert werden konnte.`,
          ),
        ),
      ),
    { dispatch: false },
  );
}
