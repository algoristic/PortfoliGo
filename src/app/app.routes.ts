import { Routes } from '@angular/router';

import { initTransactions } from './transactions/feature/state/transactions.guards';
import { isAuthenticated } from './users/feature/state/users.guards';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'app',
  },
  {
    // TODO create own feature
    path: 'app',
    canActivate: [isAuthenticated(), initTransactions()],
    loadComponent: async () => {
      return (await import('./landing/feature/landing/landing.page')).LandingPage;
    },
  },
  {
    path: 'user',
    loadChildren: async () => {
      return (await import('./users/feature/users.routes')).usersRoutes;
    },
  },
];
