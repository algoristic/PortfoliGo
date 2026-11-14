import { Component, computed, input, output } from '@angular/core';

import { NotificationChannel } from '@app/notifications/domain/models/notification-channel.model';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CODE_INFO,
  NOTIFICATION_CODES,
  NotificationCode,
} from '@app/notifications/domain/models/notification.model';
import { hasNotificationChannel } from '@app/notifications/domain/notification-channel-logic';
import {
  notificationCategoryLabel,
  notificationCodeLabel,
} from '@app/notifications/ui/labels/notification-labels';

import {
  NotificationChannelGroupView,
  NotificationChannelToggle,
} from './notification-channel-settings.model';

/**
 * Toast and browser notification per code on this device (PS US-UI-09, TS §12), grouped by
 * category. The browser switches are stored now and take effect with the browser notifications
 * (AP 6.3).
 */
@Component({
  selector: 'app-notification-channel-settings',
  imports: [],
  templateUrl: './notification-channel-settings.component.html',
  host: { class: 'block' },
})
export class NotificationChannelSettingsComponent {
  /** The effective setting of every code per channel; `null` before the settings are known. */
  channels = input<Record<NotificationChannel, Record<NotificationCode, boolean>> | null>();

  toggledChannel = output<NotificationChannelToggle>();

  groups = computed((): NotificationChannelGroupView[] => {
    const channels = this.channels();
    return NOTIFICATION_CATEGORIES.map((category) => ({
      category,
      label: notificationCategoryLabel(category),
      rows: NOTIFICATION_CODES.filter(
        (code) => NOTIFICATION_CODE_INFO[code].category === category,
      ).map((code) => {
        const label = notificationCodeLabel(code);
        return {
          code,
          label,
          toast: {
            channel: 'toast' as const,
            checked: channels?.toast[code] ?? NOTIFICATION_CODE_INFO[code].toast,
            label: `${label}: ${this.toastLabel}`,
          },
          browser: hasNotificationChannel(code, 'browser')
            ? {
                channel: 'browser' as const,
                checked: channels?.browser[code] ?? NOTIFICATION_CODE_INFO[code].browser,
                label: `${label}: ${this.browserLabel}`,
              }
            : null,
        };
      }),
    })).filter((group) => group.rows.length > 0);
  });

  toastLabel = $localize`:@@uiSettings-notificationChannelSettings-toast:Einblendung`;
  browserLabel = $localize`:@@uiSettings-notificationChannelSettings-browser:Browser`;

  onToggle(channel: NotificationChannel, code: NotificationCode, event: Event): void {
    this.toggledChannel.emit({
      channel,
      code,
      enabled: (event.target as HTMLInputElement).checked,
    });
  }
}
