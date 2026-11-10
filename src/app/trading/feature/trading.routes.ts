import { Routes } from '@angular/router';

export const tradingRoutes: Routes = [
  {
    path: '',
    title: $localize`:@@featureTrading-tradingRoutes-ordersTitle:Orders`,
    loadComponent: async () => {
      return (await import('./orders/orders.page')).OrdersPage;
    },
  },
];
