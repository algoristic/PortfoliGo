import { Routes } from '@angular/router';

import { isUserAvailable } from './state/users.guards';

export const usersRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'select',
  },
  {
    path: 'select',
    canActivate: [isUserAvailable()],
    loadComponent: async () => {
      return (await import('./select-user/select-user.page')).SelectUserPage;
    },
  },
  {
    path: 'create',
    loadComponent: async () => {
      return (await import('./create-user/create-user.page')).CreateUserPage;
    },
  },
];
