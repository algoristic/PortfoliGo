import { Routes } from '@angular/router';

const title = $localize`:@@featureAbout-aboutRoutes-aboutTitle:Über PortfoliGo`;

/** `/about`, reachable from the players page without a loaded game (US-UI-08). */
export const aboutRoutes: Routes = [
  {
    path: '',
    title,
    loadComponent: async () => {
      return (await import('./about/about.page')).AboutPage;
    },
  },
];

/** `/game/:playerId/about` inside the game area, from the settings and the player menu. */
export const gameAboutRoutes: Routes = [
  {
    path: '',
    title,
    loadComponent: async () => {
      return (await import('./game-about/game-about.page')).GameAboutPage;
    },
  },
];
