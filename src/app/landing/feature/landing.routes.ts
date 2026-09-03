import { Routes } from '@angular/router';
import { provideLandingState } from './state/landing.providers';

export const landingRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    providers: [provideLandingState()],
    loadComponent: async () => {
      return (await import('./landing/landing.page')).LandingPage;
    },
  },
];
