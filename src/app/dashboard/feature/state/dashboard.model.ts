import { FirstStepsSettings } from '@app/dashboard/domain/models/first-steps.model';

/** Quote subscription of the dashboard: top positions and watchlist (TS §8.4, §11.3). */
export const DASHBOARD_SUBSCRIPTION = 'dashboard';

/** Version of `pgo.ui.firstSteps` (TS §9.3). */
export const FIRST_STEPS_SETTINGS_VERSION = 1;

/** Watchlist entries the dashboard shows. */
export const DASHBOARD_WATCHLIST_COUNT = 5;

/** Newest notifications the dashboard shows. */
export const DASHBOARD_NOTIFICATION_COUNT = 5;

/** At most one query of „Demnächst“ in this time, the last trigger included. */
export const UPCOMING_THROTTLE_MS = 500;

export const DEFAULT_FIRST_STEPS: FirstStepsSettings = { hidden: false, banksVisited: false };

/** `pgo.ui.firstSteps`: the settings per player ID. */
export type StoredFirstSteps = Record<string, FirstStepsSettings>;
