import { DOCUMENT, inject, InjectionToken } from '@angular/core';

/** Reloads the app (platform port), e.g. after a change of the language (TS §11.9). */
export interface AppReloadPort {
  reload(): void;
}

/**
 * Reloads the document. A root default, so page tests replace it at the root injector
 * (`RecordingAppReload` in `../testing`).
 */
export const APP_RELOAD = new InjectionToken<AppReloadPort>('APP_RELOAD', {
  providedIn: 'root',
  factory: () => {
    const location = inject(DOCUMENT).location;
    return { reload: () => location.reload() };
  },
});
