import { Routes } from '@angular/router';

import { enterNewPlayerPage, enterPlayersPage, leavePlayersPage } from './state/players.guards';

// The players state is app-wide (`provideAppCore()`, TS §11.3).
export const playersRoutes: Routes = [
  {
    path: '',
    title: $localize`:@@featurePlayers-playersRoutes-playersTitle:Spielerauswahl`,
    canActivate: [enterPlayersPage()],
    canDeactivate: [leavePlayersPage()],
    loadComponent: async () => {
      return (await import('./players/players.page')).PlayersPage;
    },
  },
  {
    path: 'new',
    title: $localize`:@@featurePlayers-playersRoutes-newPlayerTitle:Spieler anlegen`,
    canActivate: [enterNewPlayerPage()],
    loadComponent: async () => {
      return (await import('./new-player/new-player.page')).NewPlayerPage;
    },
  },
];
