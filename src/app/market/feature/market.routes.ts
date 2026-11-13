import { Routes } from '@angular/router';

import {
  enterInstrumentPage,
  enterMarketsPage,
  leaveInstrumentPage,
  leaveMarketsPage,
} from './state/market.guards';

export const marketRoutes: Routes = [
  {
    path: '',
    title: $localize`:@@featureMarket-marketRoutes-marketsTitle:Märkte`,
    canActivate: [enterMarketsPage()],
    canDeactivate: [leaveMarketsPage()],
    loadComponent: async () => {
      return (await import('./markets/markets.page')).MarketsPage;
    },
  },
  {
    path: ':instrumentId',
    title: $localize`:@@featureMarket-marketRoutes-instrumentTitle:Instrument`,
    canActivate: [enterInstrumentPage()],
    canDeactivate: [leaveInstrumentPage()],
    loadComponent: async () => {
      return (await import('./instrument/instrument.page')).InstrumentPage;
    },
  },
];
