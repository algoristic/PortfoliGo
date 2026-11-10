import { Routes } from '@angular/router';

export const playersRoutes: Routes = [
  {
    path: '',
    title: $localize`:@@featurePlayers-playersRoutes-playersTitle:Spielerauswahl`,
    loadComponent: async () => {
      return (await import('./players/players.page')).PlayersPage;
    },
  },
  {
    path: 'new',
    title: $localize`:@@featurePlayers-playersRoutes-newPlayerTitle:Spieler anlegen`,
    loadComponent: async () => {
      return (await import('./new-player/new-player.page')).NewPlayerPage;
    },
  },
];
