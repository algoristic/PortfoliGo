// `ng build` replaces this file with `environment.prod.ts` (see `fileReplacements` in `angular.json`).
import { Environment } from './environment.model';

export const environment: Environment = {
  production: false,
  storeDevtools: {
    name: 'PortfoliGo',
    maxAge: 50,
  },
  devPages: true,
};
