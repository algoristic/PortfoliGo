import { InjectionToken } from '@angular/core';

export type PriceChartLibrary = typeof import('lightweight-charts');

/**
 * Loads lightweight-charts (TS §11.7, E-04). The dynamic import keeps the library in its own lazy
 * chunk; tests wrap the real library to watch its calls.
 */
export const PRICE_CHART_LIBRARY = new InjectionToken<() => Promise<PriceChartLibrary>>(
  'PRICE_CHART_LIBRARY',
  { providedIn: 'root', factory: () => () => import('lightweight-charts') },
);
