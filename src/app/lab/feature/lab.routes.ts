import { Routes } from '@angular/router';

import { enterSimulationPage, leaveSimulationPage } from './state/lab.guards';
import { provideLabState } from './state/lab.providers';

export const labRoutes: Routes = [
  {
    path: '',
    loadComponent: async () => {
      return (await import('./lab/lab.page')).LabPage;
    },
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'simulation' },
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
      {
        path: 'components',
        title: $localize`:@@featureLab-labRoutes-componentsTitle:UI-Bausteine`,
        loadComponent: async () => {
          return (await import('./components/components.page')).ComponentsPage;
        },
      },
      {
        path: 'tokens',
        title: $localize`:@@featureLab-labRoutes-tokensTitle:Design-Tokens`,
        loadComponent: async () => {
          return (await import('./tokens/tokens.page')).TokensPage;
        },
      },
    ],
  },
];
