import { Routes } from '@angular/router';

import {
  enterInstrumentPage,
  enterMarketsPage,
  enterScreenerPage,
  enterWatchlistPage,
  leaveInstrumentPage,
  leaveMarketsPage,
  leaveScreenerPage,
  leaveWatchlistPage,
} from './state/market.guards';

/**
 * The markets area (TS §11.4): a frame with tabs for the overview, the screener and the watchlist;
 * the instrument page sits beside it. The static paths come first, so `screener` and `watchlist`
 * never count as instrument IDs.
 */
export const marketRoutes: Routes = [
  {
    path: '',
    loadComponent: async () => {
      return (await import('./markets/markets.page')).MarketsPage;
    },
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: $localize`:@@featureMarket-marketRoutes-marketsTitle:Märkte`,
        canActivate: [enterMarketsPage()],
        canDeactivate: [leaveMarketsPage()],
        loadComponent: async () => {
          return (await import('./market-overview/market-overview.page')).MarketOverviewPage;
        },
      },
      {
        path: 'screener',
        title: $localize`:@@featureMarket-marketRoutes-screenerTitle:Screener`,
        canActivate: [enterScreenerPage()],
        canDeactivate: [leaveScreenerPage()],
        loadComponent: async () => {
          return (await import('./screener/screener.page')).ScreenerPage;
        },
      },
      {
        path: 'watchlist',
        title: $localize`:@@featureMarket-marketRoutes-watchlistTitle:Watchlist`,
        canActivate: [enterWatchlistPage()],
        canDeactivate: [leaveWatchlistPage()],
        loadComponent: async () => {
          return (await import('./watchlist/watchlist.page')).WatchlistPage;
        },
      },
    ],
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
