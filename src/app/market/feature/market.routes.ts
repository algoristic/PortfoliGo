import { Routes } from '@angular/router';

export const marketRoutes: Routes = [
  {
    path: '',
    title: $localize`:@@featureMarket-marketRoutes-marketsTitle:Märkte`,
    loadComponent: async () => {
      return (await import('./markets/markets.page')).MarketsPage;
    },
  },
  {
    path: ':instrumentId',
    title: $localize`:@@featureMarket-marketRoutes-instrumentTitle:Instrument`,
    loadComponent: async () => {
      return (await import('./instrument/instrument.page')).InstrumentPage;
    },
  },
];
