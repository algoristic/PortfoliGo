import { createFeatureSelector, createSelector } from '@ngrx/store';

import { selectAccounts } from '@app/banking/feature/state/banking.selectors';
import { accountTitle } from '@app/banking/ui/labels/banking-labels';
import { selectStatus } from '@app/engine/feature/state/session.selectors';
import { AccountNames } from '@app/notifications/ui/labels/notification-text.utils';

import { AutoPauseSettingsView, NOTIFICATION_PAGE_SIZE } from './notifications.model';
import { NOTIFICATIONS_FEATURE_KEY, NotificationsState } from './notifications.reducer';

const selectState = createFeatureSelector<NotificationsState>(NOTIFICATIONS_FEATURE_KEY);

export const selectLastSeq = createSelector(selectState, (state) => state.lastSeq);
export const selectUnread = createSelector(selectState, (state) => state.unread);
export const selectCenter = createSelector(selectState, (state) => state.center);
export const selectCenterCategory = createSelector(selectCenter, (center) => center.category);
export const selectPendingReport = createSelector(selectState, (state) => state.report.pending);

/** The auto-pause of every code (TS §12): a switch last sent until the engine reports it. */
export const selectAutoPause = createSelector(selectState, (state): AutoPauseSettingsView | null =>
  state.autoPause === null ? null : { ...state.autoPause, ...state.requestedAutoPause },
);

/**
 * The open page of the centre: its entries, where it lies in the matches and whether there are
 * newer or older pages. `total` is `null` until the first reply.
 */
export const selectCenterWindow = createSelector(selectCenter, (center) => {
  const total = center.total;
  return {
    entries: center.entries,
    total,
    offset: center.offset,
    first: total === null || total === 0 ? 0 : center.offset + 1,
    last: center.offset + center.entries.length,
    hasNewer: center.offset > 0,
    hasOlder: total !== null && center.offset + NOTIFICATION_PAGE_SIZE < total,
    loading: center.loading,
  };
});

/** Whether the page has unread entries or the player has unread ones elsewhere. */
export const selectHasUnread = createSelector(selectUnread, (unread) => (unread ?? 0) > 0);

/** Names of the accounts for the texts, e.g. `Girokonto 0000000001 · Hansebank` (TS §8.6). */
export const selectAccountNames = createSelector(
  selectAccounts,
  (accounts): AccountNames =>
    new Map(accounts.map((account) => [account.id, accountTitle(account, account.bank?.name)])),
);

/**
 * The report to show now: only while the game is ready, never above the overlay of loading or
 * catching up (TS §11.10).
 */
export const selectReportToShow = createSelector(
  selectPendingReport,
  selectStatus,
  (report, status) => (status === 'ready' ? report : null),
);
