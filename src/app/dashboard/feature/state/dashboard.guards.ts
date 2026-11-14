import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn } from '@angular/router';

import { DashboardFacade } from './dashboard.facade';

/** Starts „Demnächst“, the newest notifications and the quotes of the dashboard (AP 5.7). */
export function enterDashboardPage(): CanActivateFn {
  return () => {
    inject(DashboardFacade).enterDashboardPage();
    return true;
  };
}

export function leaveDashboardPage(): CanDeactivateFn<unknown> {
  return () => {
    inject(DashboardFacade).leaveDashboardPage();
    return true;
  };
}
