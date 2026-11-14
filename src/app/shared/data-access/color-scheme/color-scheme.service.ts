import { DestroyRef, DOCUMENT, inject, Injectable } from '@angular/core';

import {
  BLUE_ORANGE_CLASS,
  ChangeColors,
  ColorSchemePreference,
  PREFERS_DARK_QUERY,
  resolveColorScheme,
} from './color-scheme-service.utils';

/**
 * Keeps the `dark` class on `<html>` in sync with a colour scheme preference; with `system` it
 * follows `prefers-color-scheme`, also when that changes. Before Angular starts, the inline script
 * in `src/index.html` sets the class from the stored settings (TS §11.5). The same goes for the
 * class of the gain and loss colours (`applyChangeColors`, PS US-UI-02).
 */
@Injectable()
export class ColorSchemeService {
  readonly #document = inject(DOCUMENT);
  readonly #destroyRef = inject(DestroyRef);
  #stopFollowing: (() => void) | null = null;

  apply(preference: ColorSchemePreference): void {
    this.#stopFollowing?.();
    this.#stopFollowing = null;
    const query =
      preference === 'system'
        ? (this.#document.defaultView?.matchMedia?.(PREFERS_DARK_QUERY) ?? null)
        : null;
    this.#setDark(resolveColorScheme(preference, query?.matches ?? null) === 'dark');
    if (query === null) {
      return;
    }
    const onChange = (event: MediaQueryListEvent): void =>
      this.#setDark(resolveColorScheme('system', event.matches) === 'dark');
    query.addEventListener('change', onChange);
    const unregister = this.#destroyRef.onDestroy(() =>
      query.removeEventListener('change', onChange),
    );
    this.#stopFollowing = () => {
      query.removeEventListener('change', onChange);
      unregister();
    };
  }

  applyChangeColors(changeColors: ChangeColors): void {
    this.#document.documentElement.classList.toggle(
      BLUE_ORANGE_CLASS,
      changeColors === 'blue-orange',
    );
  }

  #setDark(isDark: boolean): void {
    this.#document.documentElement.classList.toggle('dark', isDark);
  }
}
