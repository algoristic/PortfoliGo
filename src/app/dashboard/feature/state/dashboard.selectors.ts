import { createFeatureSelector, createSelector } from '@ngrx/store';

import {
  selectAccounts,
  selectCurrentMonth,
  selectStandingOrderViews,
} from '@app/banking/feature/state/banking.selectors';
import { selectTick } from '@app/clock/feature/state/clock.selectors';
import { firstSteps, firstStepsDone } from '@app/dashboard/domain/first-steps-logic';
import {
  selectInstrumentEntities,
  selectQuoteEntities,
  selectWatchlistIds,
} from '@app/market/feature/state/market.selectors';
import {
  selectAccountNames,
  selectInstrumentNames,
} from '@app/notifications/feature/state/notifications.selectors';
import { heldInstrumentIds } from '@app/portfolio/feature/state/portfolio.utils';
import {
  selectOpenDepots,
  selectOrders,
  selectSavingsPlans,
} from '@app/trading/feature/state/trading.selectors';

import { DASHBOARD_WATCHLIST_COUNT } from './dashboard.model';
import { DASHBOARD_FEATURE_KEY, DashboardState } from './dashboard.reducer';
import {
  dashboardSeries,
  firstStepsFacts,
  topPositionEntries,
  upcomingEntries,
  watchlistSummary,
} from './dashboard.utils';

import { CashflowView, FirstStepsView, UpcomingView } from '../../ui/models/dashboard-view.model';

const selectState = createFeatureSelector<DashboardState>(DASHBOARD_FEATURE_KEY);

export const selectUpcomingResult = createSelector(selectState, (state) => state.upcoming);
export const selectRecentNotifications = createSelector(
  selectState,
  (state) => state.recentNotifications,
);
export const selectFirstStepsSettings = createSelector(selectState, (state) => state.firstSteps);
export const selectFirstStepsPlayerId = createSelector(selectState, (state) => state.playerId);

/** „Demnächst“ (TS §8.1): worker dates and planned executions after now; follows the clock. */
export const selectUpcoming = createSelector(
  selectUpcomingResult,
  selectTick,
  selectStandingOrderViews,
  selectSavingsPlans,
  selectOrders,
  selectAccountNames,
  selectInstrumentNames,
  (
    result,
    tick,
    standingOrders,
    savingsPlans,
    orders,
    accountNames,
    instrumentNames,
  ): UpcomingView => ({
    entries: upcomingEntries(
      result,
      tick,
      standingOrders,
      savingsPlans,
      orders,
      accountNames,
      instrumentNames,
    ),
    days: result?.days ?? 0,
  }),
);

/** The largest positions over all open depots (PS §10.3); follows the quotes. */
export const selectTopPositions = createSelector(
  selectOpenDepots,
  selectInstrumentEntities,
  selectQuoteEntities,
  topPositionEntries,
);

/** The first watchlist entries with their live price. */
export const selectWatchlistSummary = createSelector(
  selectWatchlistIds,
  selectInstrumentEntities,
  selectQuoteEntities,
  (ids, instruments, quotes) =>
    watchlistSummary(ids, instruments, quotes, DASHBOARD_WATCHLIST_COUNT),
);

/** Series the dashboard watches: every held instrument (to rank them) and the shown watchlist. */
export const selectDashboardSeries = createSelector(
  selectOpenDepots,
  selectWatchlistIds,
  selectInstrumentEntities,
  (depots, watchlist, instruments) =>
    dashboardSeries(
      [...heldInstrumentIds(depots), ...watchlist.slice(0, DASHBOARD_WATCHLIST_COUNT)],
      instruments,
    ),
);

/** The cash flow of the running month (US-EK-03); `null` until loaded. */
export const selectCashflow = createSelector(selectCurrentMonth, (month): CashflowView | null =>
  month === null
    ? null
    : {
        month: month.month,
        earnings: month.earnings,
        spending: month.spending,
        savingsRate: month.savingsRate,
      },
);

/** „Erste Schritte“ (US-UI-10); `null` while hidden or before the settings are loaded. */
export const selectFirstSteps = createSelector(
  selectFirstStepsSettings,
  selectFirstStepsPlayerId,
  selectAccounts,
  selectOpenDepots,
  selectOrders,
  selectSavingsPlans,
  (settings, playerId, accounts, depots, orders, savingsPlans): FirstStepsView | null => {
    if (playerId === null || settings.hidden) {
      return null;
    }
    const steps = firstSteps(
      firstStepsFacts(settings.banksVisited, accounts, depots, orders, savingsPlans),
    );
    return { steps, done: firstStepsDone(steps) };
  },
);
