import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Mock } from 'vitest';

import { PREFERS_DARK_QUERY } from './color-scheme-service.utils';
import { ColorSchemeService } from './color-scheme.service';

describe('ColorSchemeService', () => {
  let listeners: Array<(event: MediaQueryListEvent) => void>;
  let matchMedia: Mock<(query: string) => MediaQueryList>;

  function setUp(prefersDark: boolean): ColorSchemeService {
    listeners = [];
    matchMedia = vi.fn(
      (media: string) =>
        ({
          matches: prefersDark,
          media,
          addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
            listeners.push(listener);
          },
          removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
            listeners = listeners.filter((l) => l !== listener);
          },
        }) as unknown as MediaQueryList,
    );
    vi.spyOn(window, 'matchMedia').mockImplementation(matchMedia);
    TestBed.configureTestingModule({ providers: [ColorSchemeService] });
    return TestBed.inject(ColorSchemeService);
  }

  function isDark(): boolean {
    return document.documentElement.classList.contains('dark');
  }

  function changeSystem(prefersDark: boolean): void {
    listeners.forEach((l) => l({ matches: prefersDark } as MediaQueryListEvent));
  }

  afterEach(() => {
    TestBed.inject(DOCUMENT).documentElement.classList.remove('dark');
    vi.restoreAllMocks();
  });

  describe('apply', () => {
    it('sets the dark class for dark and removes it for light, whatever the system prefers', () => {
      const service = setUp(false);
      service.apply('dark');
      expect(isDark()).toBe(true);

      service.apply('light');
      expect(isDark()).toBe(false);
      expect(listeners).toHaveLength(0);
    });

    it('follows the system preference with system', () => {
      setUp(true).apply('system');
      expect(matchMedia).toHaveBeenCalledWith(PREFERS_DARK_QUERY);
      expect(isDark()).toBe(true);
    });

    it('toggles the dark class when the system preference changes', () => {
      setUp(false).apply('system');
      expect(isDark()).toBe(false);
      changeSystem(true);
      expect(isDark()).toBe(true);
      changeSystem(false);
      expect(isDark()).toBe(false);
    });

    it('stops following the system when a fixed scheme is applied', () => {
      const service = setUp(false);
      service.apply('system');
      service.apply('dark');
      expect(listeners).toHaveLength(0);
      changeSystem(false);
      expect(isDark()).toBe(true);
    });

    it('removes the change listener when the injector is destroyed', () => {
      setUp(false).apply('system');
      expect(listeners).toHaveLength(1);
      TestBed.resetTestingModule();
      expect(listeners).toHaveLength(0);
    });
  });
});
