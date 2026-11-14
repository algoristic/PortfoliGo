import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Action } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { firstValueFrom, of, Subject, throwError } from 'rxjs';
import type { Mocked } from 'vitest';

import { Settings } from '@app/settings/domain/models/settings.model';
import { ColorSchemeService } from '@app/shared/data-access/color-scheme/color-scheme.service';
import { ToastService } from '@app/shared/ui/toast/toast.service';

import * as SettingsActions from './settings.actions';
import { SettingsEffects } from './settings.effects';
import { initialSettingsState, SETTINGS_FEATURE_KEY } from './settings.reducer';

import { SettingsService } from '../../data-access/service/settings.service';

const STORED: Settings = { appearance: { colorScheme: 'light' }, shortcuts: { enabled: false } };

describe('SettingsEffects', () => {
  let effects: SettingsEffects;
  let actions$: Subject<Action>;
  let store: MockStore;
  let service: Mocked<Pick<SettingsService, 'load' | 'save'>>;
  let colorScheme: Mocked<Pick<ColorSchemeService, 'apply'>>;
  let toasts: Mocked<Pick<ToastService, 'error'>>;

  beforeEach(() => {
    actions$ = new Subject();
    service = { load: vi.fn(), save: vi.fn((settings: Settings) => of(settings)) };
    colorScheme = { apply: vi.fn() };
    toasts = { error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        SettingsEffects,
        provideMockActions(() => actions$.asObservable()),
        provideMockStore({ initialState: { [SETTINGS_FEATURE_KEY]: initialSettingsState } }),
        { provide: SettingsService, useValue: service },
        { provide: ColorSchemeService, useValue: colorScheme },
        { provide: ToastService, useValue: toasts },
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
    it('saves all settings of the store after a change', () => {
      const subscription = effects.saveSettings$.subscribe();
      setSettings(STORED);
      actions$.next(SettingsActions.toggledShortcuts({ enabled: false }));
      subscription.unsubscribe();
      expect(service.save).toHaveBeenCalledWith(STORED);
    });

    it('dispatches saveSettingsFailure when saving fails', async () => {
      const error = new DOMException('full', 'QuotaExceededError');
      service.save.mockReturnValue(throwError(() => error));
      const result = firstValueFrom(effects.saveSettings$);
      actions$.next(SettingsActions.selectedColorScheme({ colorScheme: 'light' }));
      expect(await result).toEqual(SettingsActions.saveSettingsFailure({ error }));
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
});
