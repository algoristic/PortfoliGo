import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Action } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { firstValueFrom, of, Subject, throwError } from 'rxjs';
import type { Mocked } from 'vitest';

import { Settings } from '@app/settings/domain/models/settings.model';
import { APP_RELOAD, AppReloadPort } from '@app/shared/data-access/app-reload/app-reload';
import { ColorSchemeService } from '@app/shared/data-access/color-scheme/color-scheme.service';
import { ToastService } from '@app/shared/ui/toast/toast.service';

import * as SettingsActions from './settings.actions';
import { SettingsEffects } from './settings.effects';
import { initialSettingsState, SETTINGS_FEATURE_KEY } from './settings.reducer';

import { SettingsService } from '../../data-access/service/settings.service';

const STORED: Settings = {
  appearance: { colorScheme: 'light', changeColors: 'blue-orange' },
  locale: { language: 'en' },
  motion: { priceHighlight: false },
  shortcuts: { enabled: false },
  notifications: { toast: { 'order-executed': false }, browser: {} },
};

describe('SettingsEffects', () => {
  let effects: SettingsEffects;
  let actions$: Subject<Action>;
  let store: MockStore;
  let service: Mocked<Pick<SettingsService, 'load' | 'save'>>;
  let colorScheme: Mocked<Pick<ColorSchemeService, 'apply' | 'applyChangeColors'>>;
  let toasts: Mocked<Pick<ToastService, 'error'>>;
  let appReload: Mocked<AppReloadPort>;

  beforeEach(() => {
    actions$ = new Subject();
    service = { load: vi.fn(), save: vi.fn((settings: Settings) => of(settings)) };
    colorScheme = { apply: vi.fn(), applyChangeColors: vi.fn() };
    toasts = { error: vi.fn() };
    appReload = { reload: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        SettingsEffects,
        provideMockActions(() => actions$.asObservable()),
        provideMockStore({ initialState: { [SETTINGS_FEATURE_KEY]: initialSettingsState } }),
        { provide: SettingsService, useValue: service },
        { provide: ColorSchemeService, useValue: colorScheme },
        { provide: ToastService, useValue: toasts },
        { provide: APP_RELOAD, useValue: appReload },
      ],
    });
    effects = TestBed.inject(SettingsEffects);
    store = TestBed.inject(MockStore);
  });

  afterEach(() => {
    store.resetSelectors();
  });

  function setSettings(settings: Settings): void {
    store.setState({ [SETTINGS_FEATURE_KEY]: { ...initialSettingsState, settings } });
  }

  describe('loadSettings$', () => {
    it('dispatches loadSettingsFailure when localStorage is not accessible', async () => {
      const error = new DOMException('denied', 'SecurityError');
      service.load.mockReturnValue(throwError(() => error));
      const result = firstValueFrom(effects.loadSettings$);
      actions$.next(SettingsActions.enterApp());
      expect(await result).toEqual(SettingsActions.loadSettingsFailure({ error }));
    });
  });

  describe('saveSettings$', () => {
    it('saves all settings of the store after every kind of change', () => {
      const subscription = effects.saveSettings$.subscribe();
      setSettings(STORED);
      actions$.next(SettingsActions.toggledShortcuts({ enabled: false }));
      actions$.next(SettingsActions.selectedChangeColors({ changeColors: 'blue-orange' }));
      actions$.next(SettingsActions.toggledPriceHighlight({ enabled: false }));
      actions$.next(
        SettingsActions.toggledNotificationChannel({
          channel: 'toast',
          code: 'order-executed',
          enabled: false,
        }),
      );
      subscription.unsubscribe();
      expect(service.save.mock.calls).toEqual([[STORED], [STORED], [STORED], [STORED]]);
    });

    it('dispatches saveSettingsFailure when saving fails', async () => {
      const error = new DOMException('full', 'QuotaExceededError');
      service.save.mockReturnValue(throwError(() => error));
      const result = firstValueFrom(effects.saveSettings$);
      actions$.next(SettingsActions.selectedColorScheme({ colorScheme: 'light' }));
      expect(await result).toEqual(SettingsActions.saveSettingsFailure({ error }));
    });
  });

  describe('saveLanguage$', () => {
    it('saves all settings and then reports success', async () => {
      setSettings(STORED);
      const result = firstValueFrom(effects.saveLanguage$);
      actions$.next(SettingsActions.selectedLanguage({ language: 'en' }));
      expect(await result).toEqual(SettingsActions.saveLanguageSuccess());
      expect(service.save.mock.calls).toEqual([[STORED]]);
    });

    it('dispatches saveSettingsFailure instead of reloading when saving fails', async () => {
      const error = new DOMException('full', 'QuotaExceededError');
      service.save.mockReturnValue(throwError(() => error));
      const result = firstValueFrom(effects.saveLanguage$);
      actions$.next(SettingsActions.selectedLanguage({ language: 'en' }));
      expect(await result).toEqual(SettingsActions.saveSettingsFailure({ error }));
    });
  });

  describe('reloadForLanguage$', () => {
    it('reloads the app once the language is saved', () => {
      const subscription = effects.reloadForLanguage$.subscribe();
      actions$.next(SettingsActions.selectedLanguage({ language: 'en' }));
      expect(appReload.reload).not.toHaveBeenCalled();
      actions$.next(SettingsActions.saveLanguageSuccess());
      subscription.unsubscribe();
      expect(appReload.reload).toHaveBeenCalledOnce();
    });
  });

  describe('applyColorScheme$', () => {
    it('applies the colour scheme of the store after loading, also when loading failed', () => {
      const subscription = effects.applyColorScheme$.subscribe();
      setSettings(STORED);
      actions$.next(SettingsActions.loadedSettings({ settings: STORED }));
      setSettings(initialSettingsState.settings);
      actions$.next(SettingsActions.loadSettingsFailure({ error: new Error('x') }));
      subscription.unsubscribe();
      expect(colorScheme.apply.mock.calls).toEqual([['light'], ['dark']]);
    });
  });

  describe('applyChangeColors$', () => {
    it('applies the gain and loss colours after loading, also when loading failed', () => {
      const subscription = effects.applyChangeColors$.subscribe();
      setSettings(STORED);
      actions$.next(SettingsActions.loadedSettings({ settings: STORED }));
      setSettings(initialSettingsState.settings);
      actions$.next(SettingsActions.loadSettingsFailure({ error: new Error('x') }));
      subscription.unsubscribe();
      expect(colorScheme.applyChangeColors.mock.calls).toEqual([['blue-orange'], ['green-red']]);
    });
  });
});
