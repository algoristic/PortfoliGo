import { NotificationPermissionState } from './models/browser-notification.model';
import { NotificationChannelSettings } from './models/notification-channel.model';
import { NotificationCode } from './models/notification.model';
import { notificationChannelEnabled } from './notification-channel-logic';

/** What decides about a browser notification besides its code (TS §12). */
export interface BrowserNotificationContext {
  /** Whether the app is visible (`document.visibilityState`), as the engine is told. */
  visible: boolean;
  permission: NotificationPermissionState;
  settings: Readonly<NotificationChannelSettings>;
}

/**
 * Whether a notification of `code` also becomes a browser notification (US-BN-04, TS §12): only
 * while the app is hidden, with the permission granted and the browser channel of the code on for
 * this device (its setting, else the default).
 */
export function browserNotificationApplies(
  code: NotificationCode,
  { visible, permission, settings }: BrowserNotificationContext,
): boolean {
  return (
    !visible && permission === 'granted' && notificationChannelEnabled(settings, 'browser', code)
  );
}

/** Tag of the browser notification of `code`: a newer one of the same code replaces it. */
export function browserNotificationTag(code: NotificationCode): string {
  return `pgo-${code}`;
}
