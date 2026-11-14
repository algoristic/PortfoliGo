import { Routes } from '@angular/router';

import { provideHelpState } from './state/help.providers';

const title = $localize`:@@featureHelp-helpRoutes-glossaryTitle:Glossar`;

/** `/help`, the glossary without a loaded game (PS US-UI-06). */
export const helpRoutes: Routes = [
  {
    path: '',
    title,
    providers: [provideHelpState()],
    loadComponent: async () => {
      return (await import('./help/help.page')).HelpPage;
    },
  },
];

/** `/game/:playerId/help` inside the game area, the target of the context help. */
export const gameHelpRoutes: Routes = [
  {
    path: '',
    title,
    providers: [provideHelpState()],
    loadComponent: async () => {
      return (await import('./game-help/game-help.page')).GameHelpPage;
    },
  },
];
