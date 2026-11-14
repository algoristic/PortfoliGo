import { Provider } from '@angular/core';

import {
  BrowserNotification,
  NotificationPermissionState,
} from '@app/notifications/domain/models/browser-notification.model';

import { NOTIFICATION_PORT, NotificationPort } from '../notification-port/notification-port';

/**
 * Browser notifications for tests: a set permission, the answer to a request and the shown
 * notifications in order.
 */
export class FakeNotificationPort implements NotificationPort {
  readonly shown: BrowserNotification[] = [];
  requests = 0;
  /** The permission a request ends with. */
  answer: NotificationPermissionState;
  #permission: NotificationPermissionState;

  constructor(permission: NotificationPermissionState = 'default', answer = permission) {
    this.#permission = permission;
    this.answer = answer;
  }

  permission(): NotificationPermissionState {
    return this.#permission;
  }

  async requestPermission(): Promise<NotificationPermissionState> {
    this.requests++;
    if (this.#permission === 'default') {
      this.#permission = this.answer;
    }
    return this.#permission;
  }

  async notify(notification: BrowserNotification): Promise<void> {
    this.shown.push(notification);
  }
}

/** Replaces `NOTIFICATION_PORT`; provide it at the root injector. */
export function provideFakeNotificationPort(port: FakeNotificationPort): Provider {
  return { provide: NOTIFICATION_PORT, useValue: port };
}
