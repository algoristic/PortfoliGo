import { Routes } from '@angular/router';

import { enterInstrumentPage, leaveInstrumentPage } from '@app/market/feature/state/market.guards';

import {
  enterPortfolioPage,
  enterPositionPage,
  leavePortfolioPage,
  leavePositionPage,
} from './state/portfolio.guards';

/**
 * The depot page and the position detail. The detail reuses the guards of the instrument page:
 * they watch the quote and load the chart of the instrument in the route parameter `instrumentId`.
 * Its own guards load the trades from the journal.
 */
export const portfolioRoutes: Routes = [
  {
    path: '',
    title: $localize`:@@featurePortfolio-portfolioRoutes-portfolioTitle:Depot`,
    canActivate: [enterPortfolioPage()],
    canDeactivate: [leavePortfolioPage()],
    loadComponent: async () => {
      return (await import('./portfolio/portfolio.page')).PortfolioPage;
    },
  },
  {
    path: ':instrumentId',
    title: $localize`:@@featurePortfolio-portfolioRoutes-positionTitle:Position`,
    canActivate: [enterInstrumentPage(), enterPositionPage()],
    canDeactivate: [leaveInstrumentPage(), leavePositionPage()],
    loadComponent: async () => {
      return (await import('./position/position.page')).PositionPage;
    },
  },
];
