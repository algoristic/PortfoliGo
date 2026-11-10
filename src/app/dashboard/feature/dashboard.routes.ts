import { Routes } from '@angular/router';

export const dashboardRoutes: Routes = [
  {
    path: '',
    title: $localize`:@@featureDashboard-dashboardRoutes-dashboardTitle:Übersicht`,
    loadComponent: async () => {
      return (await import('./dashboard/dashboard.page')).DashboardPage;
    },
  },
];
