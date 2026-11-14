import { DOCUMENT, inject, InjectionToken } from '@angular/core';

import {
  BrowserNotification,
  NotificationPermissionState,
} from '@app/notifications/domain/models/browser-notification.model';
import { formatLanguage } from '@app/shared/util/locale';

/**
 * Platform port for system notifications (TS §12, §13, E-05). The web implementation is
 * `WebNotificationPort`; a native one (Capacitor, N1) can replace it by a provider and add
 * scheduled notifications.
 */
export interface NotificationPort {
  /** The current permission, `unsupported` without notifications in this browser. */
  permission(): NotificationPermissionState;
  /** Asks the user; only call it during a user action. */
  requestPermission(): Promise<NotificationPermissionState>;
  /** Shows a notification; a click on it focuses the app. */
  notify(notification: BrowserNotification): Promise<void>;
}

/** Icon of the notifications, relative to `<base href="./">`. */
export const NOTIFICATION_ICON_PATH = 'assets/icons/icon-192.png';

/**
 * Notifications of the browser: through the active service worker
 * (`ServiceWorkerRegistration.showNotification()`, which Chrome for Android requires), else with
 * the `Notification` constructor. With the worker, the click is handled by `ngsw-worker.js`: the
 * `onActionClick` operation `focusLastFocusedOrOpen` focuses the app, or opens it when it was
 * closed. The fallback focuses the window itself.
 */
export class WebNotificationPort implements NotificationPort {
  readonly #window: (Window & typeof globalThis) | null;

  constructor(window: (Window & typeof globalThis) | null) {
    this.#window = window;
  }

  permission(): NotificationPermissionState {
    const notification = this.#window?.Notification;
    return notification === undefined ? 'unsupported' : notification.permission;
  }

  async requestPermission(): Promise<NotificationPermissionState> {
    const notification = this.#window?.Notification;
    if (notification === undefined) {
      return 'unsupported';
    }
    return notification.requestPermission();
  }

  async notify({ title, body, tag }: BrowserNotification): Promise<void> {
    const window = this.#window;
    if (window === null || window.Notification === undefined) {
      return;
    }
    const icon = new URL(NOTIFICATION_ICON_PATH, window.document.baseURI).href;
    const registration = await window.navigator.serviceWorker?.getRegistration();
    if (registration?.active) {
      await registration.showNotification(title, {
        body,
        tag,
        icon,
        lang: formatLanguage(),
        data: { onActionClick: { default: { operation: 'focusLastFocusedOrOpen', url: '' } } },
      });
      return;
    }
    const notification = new window.Notification(title, {
      body,
      tag,
      icon,
      lang: formatLanguage(),
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }
}

export const NOTIFICATION_PORT = new InjectionToken<NotificationPort>('NOTIFICATION_PORT', {
  providedIn: 'root',
  factory: () => new WebNotificationPort(inject(DOCUMENT).defaultView),
});
