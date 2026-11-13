import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { NotificationCategory } from '@app/notifications/domain/models/notification.model';
import { NotificationFilterComponent } from '@app/notifications/ui/notification-filter/notification-filter.component';
import { NotificationListComponent } from '@app/notifications/ui/notification-list/notification-list.component';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { EmptyStateComponent } from '@app/shared/ui/empty-state/empty-state.component';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';
import { PanelComponent } from '@app/shared/ui/panel/panel.component';
import { SkeletonComponent } from '@app/shared/ui/skeleton/skeleton.component';

import { NotificationsFacade } from '../state/notifications.facade';
import { NOTIFICATION_PAGE_SIZE } from '../state/notifications.model';

/** Notification centre (US-BN-01): all notifications of the player, newest first. */
@Component({
  selector: 'app-notifications-page',
  imports: [
    CommonModule,
    PanelComponent,
    EmptyStateComponent,
    SkeletonComponent,
    ButtonDirective,
    IconDirective,
    NotificationFilterComponent,
    NotificationListComponent,
  ],
  templateUrl: './notifications.page.html',
  host: { class: 'block' },
})
export class NotificationsPage {
  notificationsFacade = inject(NotificationsFacade);

  pageSize = NOTIFICATION_PAGE_SIZE;

  onSelectCategory(category: NotificationCategory | null): void {
    this.notificationsFacade.selectCategory(category);
  }

  onMarkAllRead(): void {
    this.notificationsFacade.markAllRead();
  }

  onMarkRead(seq: number): void {
    this.notificationsFacade.markRead(seq);
  }

  onSelectPage(offset: number): void {
    this.notificationsFacade.selectPage(offset);
  }
}
