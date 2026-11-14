import { Routes } from '@angular/router';

import { enterAppSettings } from '@app/pwa/feature/state/pwa.guards';

export const settingsRoutes: Routes = [
  {
    path: '',
    title: $localize`:@@featureSettings-settingsRoutes-settingsTitle:Einstellungen`,
    canActivate: [enterAppSettings()],
    loadComponent: async () => {
      return (await import('./settings/settings.page')).SettingsPage;
    },
  },
];
