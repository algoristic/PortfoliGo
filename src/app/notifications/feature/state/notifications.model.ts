import { AbsenceReport } from '@app/notifications/domain/models/absence-report.model';
import {
  AutoPauseCode,
  GameNotification,
  NotificationCategory,
  NotificationEntry,
  NotificationSeverity,
} from '@app/notifications/domain/models/notification.model';

/** Notifications per page of the centre (US-BN-01); at most `MAX_NOTIFICATION_LIMIT`. */
export const NOTIFICATION_PAGE_SIZE = 50;

/** The page of the notification centre that is open (TS §11.3): only its loaded window. */
export interface NotificationCenterState {
  /** `null`: all categories. */
  category: NotificationCategory | null;
  offset: number;
  /** Counts the queries; replies of older ones are dropped. */
  generation: number;
  /** Matches of the filter; `null` until the first reply. */
  total: number | null;
  entries: NotificationEntry[];
  loading: boolean;
  error?: unknown;
}

/** The absence report waiting for its dialog, and the period of the last one received. */
export interface AbsenceReportState {
  pending: AbsenceReport | null;
  /** `from`/`to` of the last report taken, so that the event and the query show it only once. */
  lastPeriod: { from: number; to: number } | null;
}

/**
 * Notifications of one code within the bundling window (TS §12): one toast, with the number when
 * there are several.
 */
export interface NotificationBundle {
  code: GameNotification['code'];
  severity: NotificationSeverity;
  count: number;
  /** The newest notification of the code, for the text of a single toast. */
  latest: GameNotification;
}

export type AutoPauseSettingsView = Record<AutoPauseCode, boolean>;
