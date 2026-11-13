import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { concatLatestFrom } from '@ngrx/operators';
import { select, Store } from '@ngrx/store';
import { catchError, concatMap, ignoreElements, map, of, switchMap, tap } from 'rxjs';

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
      ofType(SettingsActions.selectedColorScheme, SettingsActions.toggledShortcuts),
      concatLatestFrom(() => this.#store.pipe(select(SettingsSelectors.selectSettings))),
      concatMap(([, settings]) =>
        this.#settingsService.save(settings).pipe(
          ignoreElements(),
          catchError((error: unknown) => of(SettingsActions.saveSettingsFailure({ error }))),
        ),
      ),
    ),
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

  showSaveFailure$ = createEffect(
    () =>
      this.#actions$.pipe(
        ofType(SettingsActions.saveSettingsFailure),
        tap(() =>
          this.#toastService.error(
            $localize`:@@featureSettings-settingsEffects-saveFailure:Die Einstellung gilt nur bis zum Neuladen, weil sie auf diesem Gerät nicht gespeichert werden konnte.`,
          ),
        ),
      ),
    { dispatch: false },
  );
}
