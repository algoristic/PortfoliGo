import { Routes } from '@angular/router';

import { enterAccountStatementPage, leaveAccountStatementPage } from './state/banking.guards';

export const accountsRoutes: Routes = [
  {
    path: '',
    title: $localize`:@@featureBanking-accountsRoutes-accountsTitle:Konten`,
    loadComponent: async () => {
      return (await import('./accounts/accounts.page')).AccountsPage;
    },
  },
  {
    path: ':accountId',
    title: $localize`:@@featureBanking-accountsRoutes-accountStatementTitle:Kontoauszug`,
    canActivate: [enterAccountStatementPage()],
    canDeactivate: [leaveAccountStatementPage()],
    loadComponent: async () => {
      return (await import('./account-statement/account-statement.page')).AccountStatementPage;
    },
  },
];

export const banksRoutes: Routes = [
  {
    path: '',
    title: $localize`:@@featureBanking-banksRoutes-banksTitle:Bankenvergleich`,
    loadComponent: async () => {
      return (await import('./banks/banks.page')).BanksPage;
    },
  },
];
