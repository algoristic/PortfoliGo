import { inject, Injectable } from '@angular/core';
import { select, Store } from '@ngrx/store';

import * as DashboardActions from './dashboard.actions';
import * as DashboardSelectors from './dashboard.selectors';

@Injectable()
export class DashboardFacade {
  readonly #store = inject(Store);

  upcoming$ = this.#store.pipe(select(DashboardSelectors.selectUpcoming));
  topPositions$ = this.#store.pipe(select(DashboardSelectors.selectTopPositions));
  watchlist$ = this.#store.pipe(select(DashboardSelectors.selectWatchlistSummary));
  recentNotifications$ = this.#store.pipe(select(DashboardSelectors.selectRecentNotifications));
  cashflow$ = this.#store.pipe(select(DashboardSelectors.selectCashflow));
  /** `null` while hidden. */
  firstSteps$ = this.#store.pipe(select(DashboardSelectors.selectFirstSteps));

  enterDashboardPage(): void {
    this.#store.dispatch(DashboardActions.enterDashboardPage());
  }

  leaveDashboardPage(): void {
    this.#store.dispatch(DashboardActions.leaveDashboardPage());
  }

  hideFirstSteps(): void {
    this.#store.dispatch(DashboardActions.clickedHideFirstSteps());
  }
}
