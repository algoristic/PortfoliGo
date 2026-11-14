/**
 * Permission for browser notifications (TS §12): the states of `Notification.permission` and
 * `unsupported` where the browser has no notifications.
 */
export const NOTIFICATION_PERMISSIONS = ['default', 'granted', 'denied', 'unsupported'] as const;
export type NotificationPermissionState = (typeof NOTIFICATION_PERMISSIONS)[number];

/** A browser notification as the platform port shows it (`NOTIFICATION_PORT`, TS §12). */
export interface BrowserNotification {
  title: string;
  body: string;
  /** A newer notification with the same tag replaces the older one. */
  tag: string;
}
