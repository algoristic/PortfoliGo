import { inject, Injectable } from '@angular/core';
import { select, Store } from '@ngrx/store';

import {
  AutoPauseCode,
  NotificationCategory,
} from '@app/notifications/domain/models/notification.model';

import * as NotificationsActions from './notifications.actions';
import * as NotificationsSelectors from './notifications.selectors';

@Injectable()
export class NotificationsFacade {
  readonly #store = inject(Store);

  unread$ = this.#store.pipe(select(NotificationsSelectors.selectUnread));
  hasUnread$ = this.#store.pipe(select(NotificationsSelectors.selectHasUnread));
  autoPause$ = this.#store.pipe(select(NotificationsSelectors.selectAutoPause));
  category$ = this.#store.pipe(select(NotificationsSelectors.selectCenterCategory));
  centerWindow$ = this.#store.pipe(select(NotificationsSelectors.selectCenterWindow));
  accountNames$ = this.#store.pipe(select(NotificationsSelectors.selectAccountNames));

  enterNotificationsPage(): void {
    this.#store.dispatch(NotificationsActions.enterNotificationsPage());
  }

  leaveNotificationsPage(): void {
    this.#store.dispatch(NotificationsActions.leaveNotificationsPage());
  }

  selectCategory(category: NotificationCategory | null): void {
    this.#store.dispatch(NotificationsActions.selectedNotificationCategory({ category }));
  }

  selectPage(offset: number): void {
    this.#store.dispatch(NotificationsActions.selectedNotificationsPage({ offset }));
  }

  markRead(seq: number): void {
    this.#store.dispatch(NotificationsActions.clickedMarkNotificationRead({ seq }));
  }

  markAllRead(): void {
    this.#store.dispatch(NotificationsActions.clickedMarkAllNotificationsRead());
  }

  setAutoPause(code: AutoPauseCode, enabled: boolean): void {
    this.#store.dispatch(NotificationsActions.toggledAutoPause({ code, enabled }));
  }
}
