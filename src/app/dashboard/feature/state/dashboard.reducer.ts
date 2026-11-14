import { Action, createReducer, on } from '@ngrx/store';

import * as BankingActions from '@app/banking/feature/state/banking.actions';
import { FirstStepsSettings } from '@app/dashboard/domain/models/first-steps.model';
import { UpcomingResult } from '@app/engine/data-access/service/engine-service.model';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { NotificationEntry } from '@app/notifications/domain/models/notification.model';

import * as DashboardActions from './dashboard.actions';
import { DEFAULT_FIRST_STEPS } from './dashboard.model';

export const DASHBOARD_FEATURE_KEY = 'dashboard';

export interface DashboardState {
  /** The worker's part of „Demnächst“ while the page is open; `null` until loaded. */
  upcoming: UpcomingResult | null;
  /** The newest notifications while the page is open; `null` until loaded. */
  recentNotifications: NotificationEntry[] | null;
  /** Player whose `firstSteps` are loaded; `null` before. */
  playerId: string | null;
  firstSteps: FirstStepsSettings;
  error?: unknown;
}

const initialDashboardState: DashboardState = {
  upcoming: null,
  recentNotifications: null,
  playerId: null,
  firstSteps: DEFAULT_FIRST_STEPS,
};

const reducer = createReducer(
  initialDashboardState,
  on(SessionActions.enterGame, SessionActions.leaveGame, () => initialDashboardState),
  on(DashboardActions.enterDashboardPage, DashboardActions.leaveDashboardPage, (state) => ({
    ...state,
    upcoming: null,
    recentNotifications: null,
  })),
  on(DashboardActions.retrievedUpcoming, (state, { upcoming }) => ({ ...state, upcoming })),
  on(DashboardActions.retrievedRecentNotifications, (state, { entries }) => ({
    ...state,
    recentNotifications: entries,
  })),
  on(
    DashboardActions.loadUpcomingFailure,
    DashboardActions.loadRecentNotificationsFailure,
    DashboardActions.saveFirstStepsFailure,
    (state, { error }) => ({ ...state, error }),
  ),
  on(DashboardActions.loadedFirstSteps, (state, { playerId, settings }) => ({
    ...state,
    playerId,
    firstSteps: settings,
  })),
  on(DashboardActions.clickedHideFirstSteps, (state) => ({
    ...state,
    firstSteps: { ...state.firstSteps, hidden: true },
  })),
  on(BankingActions.enterBanksPage, (state) => ({
    ...state,
    firstSteps: { ...state.firstSteps, banksVisited: true },
  })),
);

export function dashboardReducer(
  state: DashboardState | undefined,
  action: Action,
): DashboardState {
  return reducer(state, action);
}
