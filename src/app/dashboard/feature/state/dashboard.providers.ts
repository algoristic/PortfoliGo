import { EnvironmentProviders, Provider } from '@angular/core';
import { provideEffects } from '@ngrx/effects';
import { provideState } from '@ngrx/store';

import { provideLocalStorageService } from '@app/persistence/data-access/local-storage/local-storage-service.providers';

import { DashboardEffects } from './dashboard.effects';
import { DashboardFacade } from './dashboard.facade';
import * as fromDashboard from './dashboard.reducer';

/**
 * Part of `provideGameState()`: the visit of the bank comparison counts for „Erste Schritte“ also
 * when the dashboard was not open (TS §11.3).
 */
export function provideDashboardState(): Array<Provider | EnvironmentProviders> {
  return [
    DashboardFacade,
    provideState(fromDashboard.DASHBOARD_FEATURE_KEY, fromDashboard.dashboardReducer),
    provideEffects(DashboardEffects),
    provideLocalStorageService(),
  ];
}
