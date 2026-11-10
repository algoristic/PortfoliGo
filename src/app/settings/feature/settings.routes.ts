import { Routes } from '@angular/router';

export const settingsRoutes: Routes = [
  {
    path: '',
    title: $localize`:@@featureSettings-settingsRoutes-settingsTitle:Einstellungen`,
    loadComponent: async () => {
      return (await import('./settings/settings.page')).SettingsPage;
    },
  },
];
