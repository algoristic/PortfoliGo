import { Routes } from '@angular/router';

export const notificationsRoutes: Routes = [
  {
    path: '',
    title: $localize`:@@featureNotifications-notificationsRoutes-notificationsTitle:Benachrichtigungen`,
    loadComponent: async () => {
      return (await import('./notifications/notifications.page')).NotificationsPage;
    },
  },
];
