import { Routes } from '@angular/router';

import { enterMonthlyValues, leaveMonthlyValues } from '@app/banking/feature/state/banking.guards';
import {
  enterPerformanceHistory,
  leavePerformanceHistory,
} from '@app/portfolio/feature/state/portfolio.guards';

import { enterDashboardPage, leaveDashboardPage } from './state/dashboard.guards';

/**
 * The dashboard (PS §10.3, AP 5.7): its own loads („Demnächst“, notifications, quotes), the daily
 * series of the net worth chart and the running month for the cash flow.
 */
export const dashboardRoutes: Routes = [
  {
    path: '',
    title: $localize`:@@featureDashboard-dashboardRoutes-dashboardTitle:Übersicht`,
    canActivate: [enterDashboardPage(), enterPerformanceHistory(), enterMonthlyValues()],
    canDeactivate: [leaveDashboardPage(), leavePerformanceHistory(), leaveMonthlyValues()],
    loadComponent: async () => {
      return (await import('./dashboard/dashboard.page')).DashboardPage;
    },
  },
];
