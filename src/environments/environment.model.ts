import { StoreDevtoolsOptions } from '@ngrx/store-devtools';

export interface Environment {
  production: boolean;
  /** `null` disables the NgRx Store Devtools. */
  storeDevtools: StoreDevtoolsOptions | null;
  /** Enables the simulation lab (`/lab`) and other developer pages. */
  devPages: boolean;
  /** Registers the Angular service worker (`ngsw-worker.js`, only in the production build). */
  serviceWorker: boolean;
}
