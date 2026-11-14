import { InjectionToken } from '@angular/core';
import { Observable, of } from 'rxjs';

import {
  DEFAULT_NOTIFICATION_CHANNEL_SETTINGS,
  NotificationChannelSettings,
} from '@app/notifications/domain/models/notification-channel.model';

/**
 * Toast and browser notification per code on this device (TS §12). The root default is the table
 * of TS §12; `provideAppCore()` provides the settings slice (AP 6.2). The toast effects of the
 * notifications and the backup reminder read it at every decision, so a switch acts at once;
 * the browser part is for `NOTIFICATION_PORT` (AP 6.3).
 */
export const NOTIFICATION_CHANNEL_SETTINGS = new InjectionToken<
  Observable<NotificationChannelSettings>
>('NOTIFICATION_CHANNEL_SETTINGS', {
  providedIn: 'root',
  factory: () => of(DEFAULT_NOTIFICATION_CHANNEL_SETTINGS),
});
