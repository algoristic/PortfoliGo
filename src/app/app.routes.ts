import { Routes } from '@angular/router';

import { environment } from '../environments/environment';

const devRoutes: Routes = [
  {
    path: 'lab',
    loadChildren: async () => {
      return (await import('@app/lab/feature/lab.routes')).labRoutes;
    },
  },
];

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'players' },
  {
    path: 'players',
    loadChildren: async () => {
      return (await import('@app/players/feature/players.routes')).playersRoutes;
    },
  },
  {
    path: 'about',
    loadChildren: async () => {
      return (await import('@app/about/feature/about.routes')).aboutRoutes;
    },
  },
  {
    path: 'game/:playerId',
    loadChildren: async () => {
      return (await import('@app/shell/feature/shell.routes')).shellRoutes;
    },
  },
  ...(environment.devPages ? devRoutes : []),
  { path: '**', redirectTo: 'players' },
];
