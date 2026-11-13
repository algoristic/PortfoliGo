import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn } from '@angular/router';

import { NotificationsFacade } from './notifications.facade';

/** Starts the notification centre (US-BN-01): its first page, then filter and paging. */
export function enterNotificationsPage(): CanActivateFn {
  return () => {
    inject(NotificationsFacade).enterNotificationsPage();
    return true;
  };
}

export function leaveNotificationsPage(): CanDeactivateFn<unknown> {
  return () => {
    inject(NotificationsFacade).leaveNotificationsPage();
    return true;
  };
}
