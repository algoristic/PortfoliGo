import { Directive } from '@angular/core';

/**
 * Link of a navigation list. The active link is styled through `aria-current="page"`, which
 * `routerLinkActive` with `ariaCurrentWhenActive="page"` sets.
 */
@Directive({
  selector: 'a[appNavLink]',
  host: {
    class:
      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap text-fg-muted transition-colors hover:bg-surface-raised hover:text-fg current:bg-surface-raised current:text-fg',
  },
})
export class NavLinkDirective {}
