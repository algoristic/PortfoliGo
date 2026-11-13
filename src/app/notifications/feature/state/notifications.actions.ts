import { createAction, props } from '@ngrx/store';

import { Tick } from '@app/clock/domain/models/time.model';
import { AbsenceReport } from '@app/notifications/domain/models/absence-report.model';
import {
  AutoPauseCode,
  GameNotification,
  NotificationCategory,
  NotificationEntry,
} from '@app/notifications/domain/models/notification.model';

export const enterNotificationsPage = createAction('[Notifications/Page] Enter notifications page');
export const leaveNotificationsPage = createAction('[Notifications/Page] Leave notifications page');
/** `null`: all categories. */
export const selectedNotificationCategory = createAction(
  '[Notifications/Page] Selected notification category',
  props<{ category: NotificationCategory | null }>(),
);
export const selectedNotificationsPage = createAction(
  '[Notifications/Page] Selected notifications page',
  props<{ offset: number }>(),
);
export const clickedMarkNotificationRead = createAction(
  '[Notifications/Page] Clicked mark notification read',
  props<{ seq: number }>(),
);
export const clickedMarkAllNotificationsRead = createAction(
  '[Notifications/Page] Clicked mark all notifications read',
);
/** Switch of the settings page (US-ZT-06, TS §12). */
export const toggledAutoPause = createAction(
  '[Notifications/Page] Toggled auto-pause',
  props<{ code: AutoPauseCode; enabled: boolean }>(),
);
/** The dialog of the absence report of this period was closed. */
export const closedAbsenceReport = createAction(
  '[Notifications/Page] Closed absence report',
  props<{ from: Tick; to: Tick }>(),
);

export const receivedNotifications = createAction(
  '[Notifications/API] Received notifications',
  props<{ tick: Tick; notifications: GameNotification[] }>(),
);
/** A page of the centre for query `generation`. */
export const retrievedNotificationsPage = createAction(
  '[Notifications/API] Retrieved notifications page',
  props<{ generation: number; total: number; entries: NotificationEntry[] }>(),
);
export const loadNotificationsFailure = createAction(
  '[Notifications/API] Load notifications failure',
  props<{ generation: number; error: unknown }>(),
);
export const markNotificationsReadSuccess = createAction(
  '[Notifications/API] Mark notifications read success',
);
export const markNotificationsReadFailure = createAction(
  '[Notifications/API] Mark notifications read failure',
  props<{ error: unknown }>(),
);
export const setAutoPauseSuccess = createAction(
  '[Notifications/API] Set auto-pause success',
  props<{ code: AutoPauseCode; enabled: boolean }>(),
);
export const setAutoPauseFailure = createAction(
  '[Notifications/API] Set auto-pause failure',
  props<{ code: AutoPauseCode; error: unknown }>(),
);
/** The `report` event (US-BN-03). */
export const receivedAbsenceReport = createAction(
  '[Notifications/API] Received absence report',
  props<{ report: AbsenceReport }>(),
);
/** The report of the query `absenceReport`, when the UI may have missed the event. */
export const retrievedAbsenceReport = createAction(
  '[Notifications/API] Retrieved absence report',
  props<{ report: AbsenceReport }>(),
);
export const loadAbsenceReportFailure = createAction(
  '[Notifications/API] Load absence report failure',
  props<{ error: unknown }>(),
);
