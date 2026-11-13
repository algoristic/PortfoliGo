import { Routes } from '@angular/router';

import { enterNotificationsPage, leaveNotificationsPage } from './state/notifications.guards';

export const notificationsRoutes: Routes = [
  {
    path: '',
    title: $localize`:@@featureNotifications-notificationsRoutes-notificationsTitle:Benachrichtigungen`,
    loadComponent: async () => {
      return (await import('./notifications/notifications.page')).NotificationsPage;
    },
    canActivate: [enterNotificationsPage()],
    canDeactivate: [leaveNotificationsPage()],
  },
];
