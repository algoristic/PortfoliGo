import { Tick } from '@app/clock/domain/models/time.model';

import {
  GameNotification,
  NOTIFICATION_CODE_INFO,
  NotificationCategory,
  NotificationEntry,
  NotificationReadState,
} from './models/notification.model';
import { isRead, oldestKeptSeq } from './read-state-logic';

/** Largest page of the notification query (TS §8.2). */
export const MAX_NOTIFICATION_LIMIT = 200;

export interface NotificationPageRequest {
  /** Query limit: the current tick (TS §8.2). */
  tick: Tick;
  /** Newest running number of the player state. */
  lastSeq: number;
  category?: NotificationCategory;
  offset: number;
  limit: number;
}

/**
 * Stored and not yet stored notifications in one list by running number; a number in both counts
 * once, as in `unsaved`.
 */
export function mergeNotifications(
  stored: readonly GameNotification[],
  unsaved: readonly GameNotification[],
): GameNotification[] {
  const bySeq = new Map<number, GameNotification>();
  for (const notification of [...stored, ...unsaved]) {
    bySeq.set(notification.seq, notification);
  }
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

/**
 * One page of the notification centre (US-BN-01), newest first, with the read state and the number
 * of all matches. Only the kept notifications up to the player's newest number and the current tick
 * count; after a restore the store may still hold others (TS §9.2).
 */
export function notificationPage(
  notifications: readonly GameNotification[],
  state: Readonly<NotificationReadState>,
  request: NotificationPageRequest,
): { total: number; entries: NotificationEntry[] } {
  const { tick, lastSeq, category, offset, limit } = request;
  const oldest = oldestKeptSeq(lastSeq);
  const matches = notifications
    .filter(
      (notification) =>
        notification.seq >= oldest &&
        notification.seq <= lastSeq &&
        notification.tick <= tick &&
        (category === undefined || NOTIFICATION_CODE_INFO[notification.code].category === category),
    )
    .sort((a, b) => b.seq - a.seq);
  return {
    total: matches.length,
    entries: matches
      .slice(offset, offset + limit)
      .map((notification) => ({ ...notification, read: isRead(state, notification.seq) })),
  };
}
