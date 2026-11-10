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

  afterEach(() => {
    TestBed.inject(DOCUMENT).documentElement.classList.remove('dark');
    vi.restoreAllMocks();
  });

  describe('init', () => {
    it('sets the dark class when the system prefers dark', () => {
      setUp(true).init();
      expect(matchMedia).toHaveBeenCalledWith(PREFERS_DARK_QUERY);
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('leaves the dark class unset when the system prefers light', () => {
      setUp(false).init();
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('toggles the dark class when the system preference changes', () => {
      setUp(false).init();
      listeners.forEach((l) => l({ matches: true } as MediaQueryListEvent));
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      listeners.forEach((l) => l({ matches: false } as MediaQueryListEvent));
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('removes the change listener when the injector is destroyed', () => {
      setUp(false).init();
      expect(listeners).toHaveLength(1);
      TestBed.resetTestingModule();
      expect(listeners).toHaveLength(0);
    });
  });
});
