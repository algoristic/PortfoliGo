import {
  MarkReadRequest,
  NotificationCommandError,
  NotificationReadState,
} from './models/notification.model';

/** Notifications kept per player (TS §9.1); older ones are deleted and count as read. */
export const MAX_STORED_NOTIFICATIONS = 1_000;

/** Oldest running number kept when `lastSeq` is the newest (0: none yet). */
export function oldestKeptSeq(lastSeq: number): number {
  return Math.max(1, lastSeq - MAX_STORED_NOTIFICATIONS + 1);
}

export function isRead(state: Readonly<NotificationReadState>, seq: number): boolean {
  return seq <= state.readUpTo || state.readSeqs.includes(seq);
}

/**
 * The same read state in its smallest form for the newest `lastSeq`: notifications no longer kept
 * count as read, and single read numbers right after the mark move it on. The state then holds at
 * most `MAX_STORED_NOTIFICATIONS − 1` single numbers.
 */
export function normalizeReadState(
  state: Readonly<NotificationReadState>,
  lastSeq: number,
): NotificationReadState {
  let readUpTo = Math.max(state.readUpTo, oldestKeptSeq(lastSeq) - 1);
  const singles = new Set(state.readSeqs.filter((seq) => seq > readUpTo));
  while (singles.delete(readUpTo + 1)) {
    readUpTo++;
  }
  return { readUpTo, readSeqs: [...singles].sort((a, b) => a - b) };
}

/**
 * Marks notifications as read (`markNotificationsRead`, TS §8.2): all up to `upTo` and the single
 * ones in `seqs`; the mark never moves back. Numbers after `lastSeq` are unknown.
 */
export function markRead(
  state: Readonly<NotificationReadState>,
  lastSeq: number,
  request: MarkReadRequest,
): { ok: true; state: NotificationReadState } | { ok: false; error: NotificationCommandError } {
  const { upTo = 0, seqs = [] } = request;
  if (upTo > lastSeq || seqs.some((seq) => seq < 1 || seq > lastSeq)) {
    return { ok: false, error: 'unknown-notification' };
  }
  const marked = {
    readUpTo: Math.max(state.readUpTo, upTo),
    readSeqs: [...state.readSeqs, ...seqs],
  };
  return { ok: true, state: normalizeReadState(marked, lastSeq) };
}

/** Unread notifications among the kept ones. */
export function unreadCount(state: Readonly<NotificationReadState>, lastSeq: number): number {
  const normal = normalizeReadState(state, lastSeq);
  return Math.max(0, lastSeq - normal.readUpTo - normal.readSeqs.length);
}
