import { Action, createReducer, on } from '@ngrx/store';

import * as BankingActions from '@app/banking/feature/state/banking.actions';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { AbsenceReport } from '@app/notifications/domain/models/absence-report.model';
import { AutoPauseCode } from '@app/notifications/domain/models/notification.model';

import * as NotificationsActions from './notifications.actions';
import {
  AbsenceReportState,
  AutoPauseSettingsView,
  NotificationCenterState,
} from './notifications.model';

export const NOTIFICATIONS_FEATURE_KEY = 'notifications';

/**
 * Notifications of the loaded player (TS §11.3, §12): counter and auto-pause settings from the
 * projection, the open page of the centre and the absence report waiting for its dialog.
 */
export interface NotificationsState {
  /** Running number of the newest notification; `null` until the first projection. */
  lastSeq: number | null;
  unread: number | null;
  autoPause: AutoPauseSettingsView | null;
  /**
   * Switches sent to the engine and not yet in a projection: the settings page shows them until
   * the engine confirms them, and the previous value again when the command fails.
   */
  requestedAutoPause: Partial<AutoPauseSettingsView>;
  center: NotificationCenterState;
  report: AbsenceReportState;
  error?: unknown;
}

export const initialCenterState: NotificationCenterState = {
  category: null,
  offset: 0,
  generation: 0,
  total: null,
  entries: [],
  loading: false,
};

export const initialNotificationsState: NotificationsState = {
  lastSeq: null,
  unread: null,
  autoPause: null,
  requestedAutoPause: {},
  center: initialCenterState,
  report: { pending: null, lastPeriod: null },
};

/** A new query of the centre; the entries shown so far stay until its reply. */
function newCenterQuery(
  state: NotificationsState,
  changes: Partial<NotificationCenterState>,
): NotificationsState {
  return {
    ...state,
    center: {
      ...state.center,
      ...changes,
      generation: state.center.generation + 1,
      loading: true,
    },
  };
}

/** Marks entries of the open page as read before the engine confirms it. */
function markEntriesRead(
  state: NotificationsState,
  isMarked: (seq: number) => boolean,
): NotificationsState {
  return {
    ...state,
    center: {
      ...state.center,
      entries: state.center.entries.map((entry) =>
        !entry.read && isMarked(entry.seq) ? { ...entry, read: true } : entry,
      ),
    },
  };
}

function withoutRequest(
  requested: Partial<AutoPauseSettingsView>,
  code: AutoPauseCode,
): Partial<AutoPauseSettingsView> {
  const result = { ...requested };
  delete result[code];
  return result;
}

/** Takes a report unless it is the one already taken (event and query of the same period). */
function takeReport(state: NotificationsState, report: AbsenceReport): NotificationsState {
  const last = state.report.lastPeriod;
  if (last !== null && last.from === report.from && last.to === report.to) {
    return state;
  }
  return {
    ...state,
    report: { pending: report, lastPeriod: { from: report.from, to: report.to } },
  };
}

const reducer = createReducer(
  initialNotificationsState,
  // Nothing of the previous player stays when another one is entered or the game is left.
  on(SessionActions.enterGame, SessionActions.leaveGame, () => initialNotificationsState),
  on(BankingActions.receivedProjection, (state, { projection }) => {
    const part = projection.notifications;
    if (part === undefined) {
      return state;
    }
    const requestedAutoPause = Object.fromEntries(
      Object.entries(state.requestedAutoPause).filter(
        ([code, enabled]) => part.autoPause[code as AutoPauseCode] !== enabled,
      ),
    );
    return {
      ...state,
      lastSeq: part.lastSeq,
      unread: part.unread,
      autoPause: part.autoPause,
      requestedAutoPause,
    };
  }),
  on(NotificationsActions.toggledAutoPause, (state, { code, enabled }) => ({
    ...state,
    requestedAutoPause: { ...state.requestedAutoPause, [code]: enabled },
  })),
  on(NotificationsActions.setAutoPauseFailure, (state, { code, error }) => ({
    ...state,
    requestedAutoPause: withoutRequest(state.requestedAutoPause, code),
    error,
  })),
  on(NotificationsActions.enterNotificationsPage, (state) =>
    newCenterQuery(state, { ...initialCenterState, generation: state.center.generation }),
  ),
  on(NotificationsActions.leaveNotificationsPage, (state) => ({
    ...state,
    center: { ...initialCenterState, generation: state.center.generation + 1 },
  })),
  on(NotificationsActions.selectedNotificationCategory, (state, { category }) =>
    newCenterQuery(state, { category, offset: 0 }),
  ),
  on(NotificationsActions.selectedNotificationsPage, (state, { offset }) =>
    newCenterQuery(state, { offset: Math.max(0, offset) }),
  ),
  on(NotificationsActions.retrievedNotificationsPage, (state, { generation, total, entries }) =>
    generation === state.center.generation
      ? {
          ...state,
          center: { ...state.center, total, entries, loading: false, error: undefined },
        }
      : state,
  ),
  on(NotificationsActions.loadNotificationsFailure, (state, { generation, error }) =>
    generation === state.center.generation
      ? { ...state, center: { ...state.center, loading: false, error } }
      : state,
  ),
  on(NotificationsActions.clickedMarkNotificationRead, (state, { seq }) =>
    markEntriesRead(state, (entrySeq) => entrySeq === seq),
  ),
  on(NotificationsActions.clickedMarkAllNotificationsRead, (state) =>
    state.lastSeq === null
      ? state
      : markEntriesRead(state, (entrySeq) => entrySeq <= (state.lastSeq ?? 0)),
  ),
  on(NotificationsActions.markNotificationsReadFailure, (state, { error }) => ({
    ...state,
    error,
  })),
  on(
    NotificationsActions.receivedAbsenceReport,
    NotificationsActions.retrievedAbsenceReport,
    (state, { report }) => takeReport(state, report),
  ),
  // A newer report that arrived while the dialog was open stays for its own dialog.
  on(NotificationsActions.closedAbsenceReport, (state, { from, to }) =>
    state.report.pending?.from === from && state.report.pending.to === to
      ? { ...state, report: { ...state.report, pending: null } }
      : state,
  ),
  on(NotificationsActions.loadAbsenceReportFailure, (state, { error }) => ({ ...state, error })),
);

export function notificationsReducer(
  state: NotificationsState | undefined,
  action: Action,
): NotificationsState {
  return reducer(state, action);
}
