import { createAction, props } from '@ngrx/store';

import { FirstStepsSettings } from '@app/dashboard/domain/models/first-steps.model';
import { UpcomingResult } from '@app/engine/data-access/service/engine-service.model';
import { NotificationEntry } from '@app/notifications/domain/models/notification.model';

export const enterDashboardPage = createAction('[Dashboard/Page] Enter dashboard page');
export const leaveDashboardPage = createAction('[Dashboard/Page] Leave dashboard page');
export const clickedHideFirstSteps = createAction('[Dashboard/Page] Clicked hide first steps');

export const retrievedUpcoming = createAction(
  '[Dashboard/API] Retrieved upcoming',
  props<{ upcoming: UpcomingResult }>(),
);
export const loadUpcomingFailure = createAction(
  '[Dashboard/API] Load upcoming failure',
  props<{ error: unknown }>(),
);
export const retrievedRecentNotifications = createAction(
  '[Dashboard/API] Retrieved recent notifications',
  props<{ entries: NotificationEntry[] }>(),
);
export const loadRecentNotificationsFailure = createAction(
  '[Dashboard/API] Load recent notifications failure',
  props<{ error: unknown }>(),
);
export const loadedFirstSteps = createAction(
  '[Dashboard/API] Loaded first steps',
  props<{ playerId: string; settings: FirstStepsSettings }>(),
);
export const saveFirstStepsFailure = createAction(
  '[Dashboard/API] Save first steps failure',
  props<{ error: unknown }>(),
);
