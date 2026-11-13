import { Component, computed, input, output } from '@angular/core';

import { FormatGameTimePipe } from '@app/clock/ui/pipes/format-game-time/format-game-time.pipe';
import {
  NOTIFICATION_CODE_INFO,
  NotificationEntry,
} from '@app/notifications/domain/models/notification.model';
import { BadgeComponent } from '@app/shared/ui/badge/badge.component';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { IconButtonDirective } from '@app/shared/ui/icon-button/icon-button.directive';

import { NotificationRowView, SEVERITY_ICONS, SEVERITY_TONES } from './notification-list.model';

import {
  notificationCategoryLabel,
  notificationSeverityLabel,
} from '../labels/notification-labels';
import { AccountNames, InstrumentNames, notificationText } from '../labels/notification-text.utils';

const NO_NAMES: AccountNames = new Map();

/**
 * Entries of the notification centre (US-BN-01), newest first: game time, category, severity and
 * text; unread ones are highlighted and can be marked read one by one.
 */
@Component({
  selector: 'app-notification-list',
  imports: [BadgeComponent, IconDirective, IconButtonDirective, FormatGameTimePipe],
  templateUrl: './notification-list.component.html',
  host: { class: 'block' },
})
export class NotificationListComponent {
  entries = input.required<NotificationEntry[]>();
  /** `null` until the accounts are known; texts then show account IDs. */
  accountNames = input<AccountNames | null>(null);
  /** `null` until the master data is loaded; texts then show instrument IDs. */
  instrumentNames = input<InstrumentNames | null>(null);

  markedRead = output<number>();

  severityIcons = SEVERITY_ICONS;

  rows = computed((): NotificationRowView[] =>
    this.entries().map((entry) => {
      const info = NOTIFICATION_CODE_INFO[entry.code];
      const { title, text } = notificationText(
        entry,
        this.accountNames() ?? NO_NAMES,
        this.instrumentNames() ?? NO_NAMES,
      );
      return {
        seq: entry.seq,
        tick: entry.tick,
        read: entry.read,
        title,
        text,
        categoryLabel: notificationCategoryLabel(info.category),
        severity: info.severity,
        severityLabel: notificationSeverityLabel(info.severity),
        severityTone: SEVERITY_TONES[info.severity],
        markReadLabel: $localize`:@@uiNotifications-notificationList-markRead:„${title}:title:“ als gelesen markieren`,
      };
    }),
  );

  listLabel = $localize`:@@uiNotifications-notificationList-label:Benachrichtigungen`;
  unreadLabel = $localize`:@@uiNotifications-notificationList-unread:Ungelesen`;

  onMarkRead(seq: number): void {
    this.markedRead.emit(seq);
  }
}
