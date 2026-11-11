import { Routes } from '@angular/router';

import { enterSimulationPage, leaveSimulationPage } from './state/lab.guards';
import { provideLabState } from './state/lab.providers';

export const labRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tokens' },
  {
    path: 'tokens',
    loadComponent: async () => {
      return (await import('./tokens/tokens.page')).TokensPage;
    },
  },
  {
    path: 'components',
    loadComponent: async () => {
      return (await import('./components/components.page')).ComponentsPage;
    },
  },
  {
    path: 'simulation',
    title: $localize`:@@featureLab-labRoutes-simulationTitle:Simulations-Labor`,
    providers: [provideLabState()],
    canActivate: [enterSimulationPage()],
    canDeactivate: [leaveSimulationPage()],
    loadComponent: async () => {
      return (await import('./simulation/simulation.page')).SimulationPage;
    },
  },
];
