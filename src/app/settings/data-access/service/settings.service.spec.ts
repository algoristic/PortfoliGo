import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { provideSettingsService } from './settings-service.providers';
import { SettingsService } from './settings.service';

// PS US-UI-01, E-06: dark by default; TS §11.10: shortcuts on by default.
const DEFAULTS = { appearance: { colorScheme: 'dark' }, shortcuts: { enabled: true } };

describe('SettingsService', () => {
  let service: SettingsService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideSettingsService()] });
    service = TestBed.inject(SettingsService);
  });

  describe('load', () => {
    it('returns the defaults when nothing is stored', async () => {
      expect(await firstValueFrom(service.load())).toEqual(DEFAULTS);
    });

    it('returns the stored settings of version 1', async () => {
      localStorage.setItem(
        'pgo.settings',
        JSON.stringify({
          v: 1,
          data: { appearance: { colorScheme: 'light' }, shortcuts: { enabled: false } },
        }),
      );

      expect(await firstValueFrom(service.load())).toEqual({
        appearance: { colorScheme: 'light' },
        shortcuts: { enabled: false },
      });
    });

    it.each([
      ['another version', JSON.stringify({ v: 0, data: { appearance: { colorScheme: 'light' } } })],
      ['an unversioned value', JSON.stringify({ appearance: { colorScheme: 'light' } })],
      ['broken JSON', '{"v":1,"data":'],
    ])('returns the defaults for %s', async (_label, raw) => {
      localStorage.setItem('pgo.settings', raw);

      expect(await firstValueFrom(service.load())).toEqual(DEFAULTS);
    });
  });

  describe('save', () => {
    it('stores the settings as version 1, which load reads back', async () => {
      const settings = {
        appearance: { colorScheme: 'system' as const },
        shortcuts: { enabled: false },
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
