import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { FormatGameTimePipe } from '@app/clock/ui/pipes/format-game-time/format-game-time.pipe';
import {
  NOTIFICATION_CODE_INFO,
  NotificationEntry,
} from '@app/notifications/domain/models/notification.model';
import {
  AccountNames,
  InstrumentNames,
  notificationText,
} from '@app/notifications/ui/labels/notification-text.utils';
import { SEVERITY_ICONS } from '@app/notifications/ui/notification-list/notification-list.model';
import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';

const NO_NAMES: AccountNames = new Map();

interface RecentRow {
  seq: number;
  tick: number;
  read: boolean;
  title: string;
  icon: string;
  iconClass: string;
}

/** The newest notifications (PS §10.3) with a link to the centre. */
@Component({
  selector: 'app-recent-notifications',
  imports: [
    RouterLink,
    PanelComponent,
    EmptyStateComponent,
    SkeletonComponent,
    IconDirective,
    FormatGameTimePipe,
  ],
  templateUrl: './recent-notifications.component.html',
  host: { class: 'block' },
})
export class RecentNotificationsComponent {
  /** `null` while loading. */
  entries = input.required<NotificationEntry[] | null>();
  accountNames = input<AccountNames | null>(null);
  instrumentNames = input<InstrumentNames | null>(null);

  rows = computed(
    (): RecentRow[] | null =>
      this.entries()?.map((entry) => {
        const { severity } = NOTIFICATION_CODE_INFO[entry.code];
        return {
          seq: entry.seq,
          tick: entry.tick,
          read: entry.read,
          title: notificationText(
            entry,
            this.accountNames() ?? NO_NAMES,
            this.instrumentNames() ?? NO_NAMES,
          ).title,
          icon: SEVERITY_ICONS[severity].icon,
          iconClass: SEVERITY_ICONS[severity].color,
        };
      }) ?? null,
  );

  heading = $localize`:@@uiDashboard-recentNotifications-heading:Letzte Benachrichtigungen`;
  unreadLabel = $localize`:@@uiDashboard-recentNotifications-unread:Ungelesen`;
}
