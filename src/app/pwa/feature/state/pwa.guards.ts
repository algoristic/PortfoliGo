import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';

import { PwaFacade } from './pwa.facade';

/** The settings page shows the storage status and the permission as they are now (TS §13). */
export function enterAppSettings(): CanActivateFn {
  return () => {
    inject(PwaFacade).enterAppSettings();
    return true;
  };
}
