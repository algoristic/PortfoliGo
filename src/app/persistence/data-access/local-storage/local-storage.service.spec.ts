import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { LocalStorageService } from './local-storage.service';

describe('LocalStorageService', () => {
  let service: LocalStorageService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [LocalStorageService] });
    service = TestBed.inject(LocalStorageService);
  });

  describe('set', () => {
    it('stores the value as versioned JSON', async () => {
      await firstValueFrom(service.set('pgo.lastPlayerId', 1, 'p1'));

      expect(JSON.parse(localStorage.getItem('pgo.lastPlayerId') ?? '')).toEqual({
        v: 1,
        data: 'p1',
      });
    });
  });

  describe('get', () => {
    it('returns a stored value of the same version', async () => {
      await firstValueFrom(service.set('pgo.ui.chart', 2, { type: 'candles' }));

      expect(await firstValueFrom(service.get('pgo.ui.chart', 2))).toEqual({ type: 'candles' });
    });

    it('returns undefined when the key is missing', async () => {
      expect(await firstValueFrom(service.get('pgo.settings', 1))).toBeUndefined();
    });

    it('returns undefined when the version differs', async () => {
      await firstValueFrom(service.set('pgo.settings', 1, { theme: 'dark' }));

      expect(await firstValueFrom(service.get('pgo.settings', 2))).toBeUndefined();
    });

    it('returns undefined when the stored value is not valid versioned JSON', async () => {
      localStorage.setItem('pgo.settings', '{broken');
      localStorage.setItem('pgo.backup', JSON.stringify({ theme: 'dark' }));

      expect(await firstValueFrom(service.get('pgo.settings', 1))).toBeUndefined();
      expect(await firstValueFrom(service.get('pgo.backup', 1))).toBeUndefined();
    });
  });

  describe('remove', () => {
    it('deletes the entry', async () => {
      await firstValueFrom(service.set('pgo.lastPlayerId', 1, 'p1'));
      await firstValueFrom(service.remove('pgo.lastPlayerId'));

      expect(localStorage.getItem('pgo.lastPlayerId')).toBeNull();
    });
  });
});
