import { Routes } from '@angular/router';

import { provideShellState } from './state/shell.providers';

/** Game area at `/game/:playerId` (TS §11.4); `enterGame`/`leaveGame` and `provideGameState()` follow in AP 2.5. */
export const shellRoutes: Routes = [
  {
    path: '',
    loadComponent: async () => {
      return (await import('./shell/shell.page')).ShellPage;
    },
    providers: [provideShellState()],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadChildren: async () => {
          return (await import('../../dashboard/feature/dashboard.routes')).dashboardRoutes;
        },
      },
      {
        path: 'markets',
        loadChildren: async () => {
          return (await import('../../market/feature/market.routes')).marketRoutes;
        },
      },
      {
        path: 'portfolio',
        loadChildren: async () => {
          return (await import('../../portfolio/feature/portfolio.routes')).portfolioRoutes;
        },
      },
      {
        path: 'accounts',
        loadChildren: async () => {
          return (await import('../../banking/feature/banking.routes')).accountsRoutes;
        },
      },
      {
        path: 'banks',
        loadChildren: async () => {
          return (await import('../../banking/feature/banking.routes')).banksRoutes;
        },
      },
      {
        path: 'orders',
        loadChildren: async () => {
          return (await import('../../trading/feature/trading.routes')).tradingRoutes;
        },
      },
      {
        path: 'taxes',
        loadChildren: async () => {
          return (await import('../../taxes/feature/taxes.routes')).taxesRoutes;
        },
      },
      {
        path: 'notifications',
        loadChildren: async () => {
          return (await import('../../notifications/feature/notifications.routes'))
            .notificationsRoutes;
        },
      },
      {
        path: 'settings',
        loadChildren: async () => {
          return (await import('../../settings/feature/settings.routes')).settingsRoutes;
        },
      },
    ],
  },
];
