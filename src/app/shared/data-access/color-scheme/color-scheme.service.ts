import { DestroyRef, DOCUMENT, inject, Injectable } from '@angular/core';

import { PREFERS_DARK_QUERY, resolveColorScheme } from './color-scheme-service.utils';

/** Keeps the `dark` class on `<html>` in sync with the system colour scheme. */
@Injectable()
export class ColorSchemeService {
  readonly #document = inject(DOCUMENT);
  readonly #destroyRef = inject(DestroyRef);

  init(): void {
    const view = this.#document.defaultView;
    if (!view?.matchMedia) {
      return;
    }
    const query = view.matchMedia(PREFERS_DARK_QUERY);
    const apply = (prefersDark: boolean): void => {
      const isDark = resolveColorScheme(prefersDark) === 'dark';
      this.#document.documentElement.classList.toggle('dark', isDark);
    };
    const onChange = (event: MediaQueryListEvent): void => apply(event.matches);

    apply(query.matches);
    query.addEventListener('change', onChange);
    this.#destroyRef.onDestroy(() => query.removeEventListener('change', onChange));
  }
}
