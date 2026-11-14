import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { Settings } from '@app/settings/domain/models/settings.model';

import { provideSettingsService } from './settings-service.providers';
import { SettingsService } from './settings.service';

// TS §9.3: PS US-UI-01, E-06 dark; US-UI-02 green and red; US-MK-05 highlight on; TS §11.10
// shortcuts on; no own toast or browser setting (the table of TS §12 applies).
const DEFAULTS: Settings = {
  appearance: { colorScheme: 'dark', changeColors: 'green-red' },
  motion: { priceHighlight: true },
  shortcuts: { enabled: true },
  notifications: { toast: {}, browser: {} },
};

describe('SettingsService', () => {
  let service: SettingsService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideSettingsService()] });
    service = TestBed.inject(SettingsService);
  });

  function store(value: unknown): void {
    localStorage.setItem('pgo.settings', JSON.stringify(value));
  }

  describe('load', () => {
    it('returns the defaults when nothing is stored', async () => {
      expect(await firstValueFrom(service.load())).toEqual(DEFAULTS);
    });

    it('returns the stored settings of version 1', async () => {
      store({
        v: 1,
        data: {
          appearance: { colorScheme: 'light', changeColors: 'blue-orange' },
          motion: { priceHighlight: false },
          shortcuts: { enabled: false },
          notifications: { toast: { 'order-executed': false }, browser: { 'year-closed': true } },
        },
      });

      expect(await firstValueFrom(service.load())).toEqual({
        appearance: { colorScheme: 'light', changeColors: 'blue-orange' },
        motion: { priceHighlight: false },
        shortcuts: { enabled: false },
        notifications: { toast: { 'order-executed': false }, browser: { 'year-closed': true } },
      });
    });

    it('completes an entry of AP 2.6 with the defaults of the new sections', async () => {
      store({
        v: 1,
        data: { appearance: { colorScheme: 'light' }, shortcuts: { enabled: false } },
      });

      expect(await firstValueFrom(service.load())).toEqual({
        ...DEFAULTS,
        appearance: { colorScheme: 'light', changeColors: 'green-red' },
        shortcuts: { enabled: false },
      });
    });

    it('replaces invalid values by their defaults and keeps the valid ones', async () => {
      store({
        v: 1,
        data: {
          appearance: { colorScheme: 'light', changeColors: 'purple' },
          motion: { priceHighlight: 'off' },
          notifications: { toast: { 'order-executed': false, 'no-such-code': false } },
        },
      });

      expect(await firstValueFrom(service.load())).toEqual({
        ...DEFAULTS,
        appearance: { colorScheme: 'light', changeColors: 'green-red' },
        notifications: { toast: { 'order-executed': false }, browser: {} },
      });
    });

    it.each([
      ['another version', JSON.stringify({ v: 0, data: { appearance: { colorScheme: 'light' } } })],
      ['a later version', JSON.stringify({ v: 2, data: { motion: { priceHighlight: false } } })],
      ['an unversioned value', JSON.stringify({ appearance: { colorScheme: 'light' } })],
      ['broken JSON', '{"v":1,"data":'],
    ])('returns the defaults for %s', async (_label, raw) => {
      localStorage.setItem('pgo.settings', raw);

      expect(await firstValueFrom(service.load())).toEqual(DEFAULTS);
    });
  });

  describe('save', () => {
    it('stores the settings as version 1, which load reads back', async () => {
      const settings: Settings = {
        appearance: { colorScheme: 'system', changeColors: 'blue-orange' },
        motion: { priceHighlight: false },
        shortcuts: { enabled: false },
        notifications: {
          toast: { 'backup-reminder': false },
          browser: { 'order-rejected': false },
        },
      };

      await firstValueFrom(service.save(settings));

      expect(JSON.parse(localStorage.getItem('pgo.settings') ?? 'null')).toEqual({
        v: 1,
        data: settings,
      });
      expect(await firstValueFrom(service.load())).toEqual(settings);
    });
  });
});
