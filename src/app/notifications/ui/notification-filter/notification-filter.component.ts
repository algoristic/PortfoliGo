import { Component, input, output } from '@angular/core';

import {
  NOTIFICATION_CATEGORIES,
  NotificationCategory,
} from '@app/notifications/domain/models/notification.model';
import { ButtonDirective } from '@app/shared/ui/button/button.directive';
import { IconDirective } from '@app/shared/ui/icon/icon.directive';

import { SelectDirective } from '@app/shared/ui/select/select.directive';

import { notificationCategoryLabel } from '../labels/notification-labels';

/** Filter of the notification centre by category and „Alle als gelesen markieren“ (US-BN-01). */
@Component({
  selector: 'app-notification-filter',
  imports: [SelectDirective, ButtonDirective, IconDirective],
  templateUrl: './notification-filter.component.html',
  host: { class: 'block' },
})
export class NotificationFilterComponent {
  /** `null`: all categories. */
  category = input<NotificationCategory | null>(null);
  hasUnread = input(false);

  selectedCategory = output<NotificationCategory | null>();
  clickedMarkAllRead = output<void>();

  categoryOptions = NOTIFICATION_CATEGORIES.map((id) => ({
    id,
    label: notificationCategoryLabel(id),
  }));

  allLabel = $localize`:@@uiNotifications-notificationFilter-all:Alle Kategorien`;

  onSelectCategory(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedCategory.emit(
      (NOTIFICATION_CATEGORIES as readonly string[]).includes(value)
        ? (value as NotificationCategory)
        : null,
    );
  }

  onMarkAllRead(): void {
    this.clickedMarkAllRead.emit();
  }
}
