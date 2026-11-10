import { Routes } from '@angular/router';

export const labRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tokens' },
  {
    path: 'tokens',
    loadComponent: async () => {
      return (await import('./tokens/tokens.page')).TokensPage;
    },
  },
];
