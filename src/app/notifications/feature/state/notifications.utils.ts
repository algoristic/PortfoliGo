import { NotificationChannelSettings } from '@app/notifications/domain/models/notification-channel.model';
import {
  GameNotification,
  NOTIFICATION_CODE_INFO,
  NotificationSeverity,
} from '@app/notifications/domain/models/notification.model';
import { notificationChannelEnabled } from '@app/notifications/domain/notification-channel-logic';
import { ToastTone } from '@app/shared/ui/toast/toast.model';

import { NotificationBundle } from './notifications.model';

/**
 * Toasts of the notifications of one bundling window (US-BN-02, TS §12): only codes whose toast is
 * on for this device (`settings`, else the default of TS §12), one bundle per code with its number
 * and its newest notification, in the order the codes first occurred.
 */
export function bundleToastNotifications(
  notifications: readonly GameNotification[],
  settings: Readonly<NotificationChannelSettings>,
): NotificationBundle[] {
  const bundles = new Map<GameNotification['code'], NotificationBundle>();
  for (const notification of notifications) {
    const info = NOTIFICATION_CODE_INFO[notification.code];
    if (!notificationChannelEnabled(settings, 'toast', notification.code)) {
      continue;
    }
    const bundle = bundles.get(notification.code);
    bundles.set(
      notification.code,
      bundle === undefined
        ? { code: notification.code, severity: info.severity, count: 1, latest: notification }
        : {
            ...bundle,
            count: bundle.count + 1,
            latest: notification.seq >= bundle.latest.seq ? notification : bundle.latest,
          },
    );
  }
  return [...bundles.values()];
}

/** Critical notifications show as errors, warnings as warnings, the rest as information. */
export function toastTone(severity: NotificationSeverity): ToastTone {
  switch (severity) {
    case 'critical':
      return 'error';
    case 'warning':
      return 'warning';
    case 'info':
    case 'hint':
      return 'info';
  }
}
