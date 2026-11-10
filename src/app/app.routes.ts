import { Routes } from '@angular/router';

import { environment } from '../environments/environment';

const devRoutes: Routes = [
  {
    path: 'lab',
    loadChildren: async () => {
      return (await import('./lab/feature/lab.routes')).labRoutes;
    },
  },
];

export const routes: Routes = [...(environment.devPages ? devRoutes : [])];
