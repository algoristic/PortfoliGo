import { InjectionToken } from '@angular/core';
import { Observable, of } from 'rxjs';

/**
 * Whether the clock shortcuts are on (WCAG 2.1.4, TS §11.10). The root default is "on"; AP 2.6
 * provides the switch of the settings slice here, e.g.
 * `{ provide: CLOCK_SHORTCUTS_ENABLED, useFactory: () => inject(SettingsFacade).shortcutsEnabled$ }`.
 */
export const CLOCK_SHORTCUTS_ENABLED = new InjectionToken<Observable<boolean>>(
  'CLOCK_SHORTCUTS_ENABLED',
  {
    providedIn: 'root',
    factory: () => of(true),
  },
);
