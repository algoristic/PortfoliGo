import { Routes } from '@angular/router';
import { isAuthenticated } from './users/feature/state/users.guards';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'home',
  },
  {
    // TODO create own feature
    path: 'home',
    canActivate: [isAuthenticated()],
    loadComponent: async () => {
      return (await import('./home/home.page')).HomePage;
    },
  },
  {
    path: 'user',
    loadChildren: async () => {
      return (await import('./users/feature/users.routes')).usersRoutes;
    },
  },
];
