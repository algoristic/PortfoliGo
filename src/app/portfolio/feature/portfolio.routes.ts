import { Routes } from '@angular/router';

export const portfolioRoutes: Routes = [
  {
    path: '',
    title: $localize`:@@featurePortfolio-portfolioRoutes-portfolioTitle:Depot`,
    loadComponent: async () => {
      return (await import('./portfolio/portfolio.page')).PortfolioPage;
    },
  },
];
