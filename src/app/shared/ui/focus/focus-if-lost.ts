import { afterNextRender, DOCUMENT, Injector } from '@angular/core';

/**
 * After the next render, moves the focus to `target` if it was lost to `<body>`, e.g. because the
 * focused element was removed. A focus the user has put elsewhere is left alone (TS §11.10).
 */
export function focusIfLost(injector: Injector, target: () => HTMLElement | undefined): void {
  afterNextRender(
    () => {
      const document = injector.get(DOCUMENT);
      const active = document.activeElement;
      if (active === null || active === document.body) {
        target()?.focus();
      }
    },
    { injector },
  );
}
