import { Routes } from '@angular/router';

export const taxesRoutes: Routes = [
  {
    path: '',
    title: $localize`:@@featureTaxes-taxesRoutes-taxesTitle:Steuern`,
    loadComponent: async () => {
      return (await import('./taxes/taxes.page')).TaxesPage;
    },
  },
];
