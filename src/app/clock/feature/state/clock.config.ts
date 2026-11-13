import { InjectionToken } from '@angular/core';
import { Observable, of } from 'rxjs';

/**
 * Whether the clock shortcuts are on (WCAG 2.1.4, TS §11.10). The root default is "on";
 * `provideAppCore()` provides the switch of the settings slice (AP 2.6).
 */
export const CLOCK_SHORTCUTS_ENABLED = new InjectionToken<Observable<boolean>>(
  'CLOCK_SHORTCUTS_ENABLED',
  {
    providedIn: 'root',
    factory: () => of(true),
  },
);
