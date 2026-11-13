import { Routes } from '@angular/router';

import { enterPortfolioPage, leavePortfolioPage } from './state/portfolio.guards';

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
];
