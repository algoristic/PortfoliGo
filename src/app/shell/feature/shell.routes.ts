import { Routes } from '@angular/router';

import { enterGame, leaveGame } from '@app/engine/feature/state/session.guards';

import { provideGameState } from './state/game-state.providers';
import { provideShellState } from './state/shell.providers';

/**
 * Game area at `/game/:playerId` (TS §11.4). The guards run again when the player in the URL
 * changes, because the parameter belongs to this route's parent: `leaveGame`, then `enterGame`.
 */
export const shellRoutes: Routes = [
  {
    path: '',
    loadComponent: async () => {
      return (await import('./shell/shell.page')).ShellPage;
    },
    providers: [provideShellState(), provideGameState()],
    canActivate: [enterGame()],
    canDeactivate: [leaveGame()],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadChildren: async () => {
          return (await import('@app/dashboard/feature/dashboard.routes')).dashboardRoutes;
        },
      },
      {
        path: 'markets',
        loadChildren: async () => {
          return (await import('@app/market/feature/market.routes')).marketRoutes;
        },
      },
      {
        path: 'portfolio',
        loadChildren: async () => {
          return (await import('@app/portfolio/feature/portfolio.routes')).portfolioRoutes;
        },
      },
      {
        path: 'accounts',
        loadChildren: async () => {
          return (await import('@app/banking/feature/banking.routes')).accountsRoutes;
        },
      },
      {
        path: 'banks',
        loadChildren: async () => {
          return (await import('@app/banking/feature/banking.routes')).banksRoutes;
        },
      },
      {
        path: 'orders',
        loadChildren: async () => {
          return (await import('@app/trading/feature/trading.routes')).tradingRoutes;
        },
      },
      {
        path: 'taxes',
        loadChildren: async () => {
          return (await import('@app/taxes/feature/taxes.routes')).taxesRoutes;
        },
      },
      {
        path: 'notifications',
        loadChildren: async () => {
          return (await import('@app/notifications/feature/notifications.routes'))
            .notificationsRoutes;
        },
      },
      {
        path: 'settings',
        loadChildren: async () => {
          return (await import('@app/settings/feature/settings.routes')).settingsRoutes;
        },
      },
      {
        path: 'about',
        loadChildren: async () => {
          return (await import('@app/about/feature/about.routes')).gameAboutRoutes;
        },
      },
      {
        path: 'help',
        loadChildren: async () => {
          return (await import('@app/help/feature/help.routes')).gameHelpRoutes;
        },
      },
    ],
  },
];
