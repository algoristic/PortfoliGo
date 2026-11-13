import { emptyMonthlyValues } from '@app/banking/domain/monthly-values-logic';
import * as BankingActions from '@app/banking/feature/state/banking.actions';
import {
  NotificationsProjection,
  ProjectionPayload,
} from '@app/engine/data-access/service/engine-service.model';
import * as SessionActions from '@app/engine/feature/state/session.actions';
import { AbsenceReport } from '@app/notifications/domain/models/absence-report.model';
import {
  AUTO_PAUSE_CODES,
  AutoPauseCode,
  NotificationEntry,
} from '@app/notifications/domain/models/notification.model';
import { PlayerProfile } from '@app/players/domain/models/player.model';

import * as NotificationsActions from './notifications.actions';
import {
  initialNotificationsState,
  notificationsReducer,
  NotificationsState,
} from './notifications.reducer';

const DEFAULTS = Object.fromEntries(
  AUTO_PAUSE_CODES.map((code) => [code, code === 'overdraft-limit-exceeded']),
) as Record<AutoPauseCode, boolean>;

function projection(notifications?: NotificationsProjection): ProjectionPayload {
  return { tick: 1, full: false, accounts: [], netWorth: 0, notifications };
}

function entry(seq: number, read = false): NotificationEntry {
  return {
    seq,
    tick: seq,
    code: 'account-uncovered',
    params: { accountId: 'acc-1', balance: -100, limit: null },
    read,
  };
}

function report(from: number, to: number): AbsenceReport {
  return {
    from,
    to,
    netWorthBefore: 0,
    netWorthAfter: 0,
    flows: emptyMonthlyValues(),
    bookings: 1,
    notifications: 0,
    warnings: [],
    warningCount: 0,
    orders: [],
    orderCount: 0,
    indices: [],
  };
}

function reduce(...actions: Parameters<typeof notificationsReducer>[1][]): NotificationsState {
  return actions.reduce(
    (state: NotificationsState, action) => notificationsReducer(state, action),
    initialNotificationsState,
  );
}

describe('notificationsReducer', () => {
  it('takes counter and auto-pause from projections that carry them and keeps them otherwise', () => {
    const part = { lastSeq: 3, unread: 2, autoPause: DEFAULTS };
    const state = reduce(
      BankingActions.receivedProjection({ projection: projection(part) }),
      BankingActions.receivedProjection({ projection: projection() }),
    );
    expect(state).toMatchObject({ lastSeq: 3, unread: 2, autoPause: DEFAULTS });
  });

  describe('auto-pause switches', () => {
    const toggled = NotificationsActions.toggledAutoPause({
      code: 'account-uncovered',
      enabled: true,
    });

    it('keeps a switch until a projection confirms it', () => {
      const unconfirmed = reduce(
        toggled,
        BankingActions.receivedProjection({
          projection: projection({ lastSeq: 0, unread: 0, autoPause: DEFAULTS }),
        }),
      );
      expect(unconfirmed.requestedAutoPause).toEqual({ 'account-uncovered': true });

      const confirmed = notificationsReducer(
        unconfirmed,
        BankingActions.receivedProjection({
          projection: projection({
            lastSeq: 0,
            unread: 0,
            autoPause: { ...DEFAULTS, 'account-uncovered': true },
          }),
        }),
      );
      expect(confirmed.requestedAutoPause).toEqual({});
    });

    it('drops the switch of a failed command and keeps the others', () => {
      const state = reduce(
        toggled,
        NotificationsActions.toggledAutoPause({ code: 'month-closed', enabled: true }),
        NotificationsActions.setAutoPauseFailure({ code: 'account-uncovered', error: 'busy' }),
      );
      expect(state.requestedAutoPause).toEqual({ 'month-closed': true });
    });
  });

  describe('centre', () => {
    it('drops the reply of an older query', () => {
      const entered = reduce(NotificationsActions.enterNotificationsPage());
      const generation = entered.center.generation;
      const filtered = notificationsReducer(
        entered,
        NotificationsActions.selectedNotificationCategory({ category: 'system' }),
      );
      const stale = notificationsReducer(
        filtered,
        NotificationsActions.retrievedNotificationsPage({
          generation,
          total: 1,
          entries: [entry(1)],
        }),
      );
      expect(stale.center).toMatchObject({ total: null, entries: [], loading: true });

      const current = notificationsReducer(
        stale,
        NotificationsActions.retrievedNotificationsPage({
          generation: filtered.center.generation,
          total: 1,
          entries: [entry(2)],
        }),
      );
      expect(current.center).toMatchObject({ total: 1, entries: [entry(2)], loading: false });
    });

    it('starts a new category on the first page', () => {
      const state = reduce(
        NotificationsActions.enterNotificationsPage(),
        NotificationsActions.selectedNotificationsPage({ offset: 50 }),
        NotificationsActions.selectedNotificationCategory({ category: 'account' }),
      );
      expect(state.center).toMatchObject({ category: 'account', offset: 0 });
    });

    it('marks one entry and all entries up to the newest number read at once', () => {
      const loaded = reduce(
        BankingActions.receivedProjection({
          projection: projection({ lastSeq: 3, unread: 3, autoPause: DEFAULTS }),
        }),
        NotificationsActions.enterNotificationsPage(),
      );
      const withEntries = notificationsReducer(
        loaded,
        NotificationsActions.retrievedNotificationsPage({
          generation: loaded.center.generation,
          total: 3,
          entries: [entry(3), entry(2), entry(1)],
        }),
      );
      const one = notificationsReducer(
        withEntries,
        NotificationsActions.clickedMarkNotificationRead({ seq: 2 }),
      );
      expect(one.center.entries.map(({ read }) => read)).toEqual([false, true, false]);

      const all = notificationsReducer(one, NotificationsActions.clickedMarkAllNotificationsRead());
      expect(all.center.entries.map(({ read }) => read)).toEqual([true, true, true]);
    });
  });

  describe('absence report', () => {
    it('takes a period once, whether from the event or the query', () => {
      const first = report(10, 20);
      const state = reduce(
        NotificationsActions.receivedAbsenceReport({ report: first }),
        NotificationsActions.closedAbsenceReport({ from: 10, to: 20 }),
        NotificationsActions.retrievedAbsenceReport({ report: report(10, 20) }),
      );
      expect(state.report.pending).toBeNull();

      const next = notificationsReducer(
        state,
        NotificationsActions.retrievedAbsenceReport({ report: report(20, 30) }),
      );
      expect(next.report.pending).toEqual(report(20, 30));
    });

    it('keeps a newer report when the dialog of an older one closes', () => {
      const state = reduce(
        NotificationsActions.receivedAbsenceReport({ report: report(10, 20) }),
        NotificationsActions.receivedAbsenceReport({ report: report(20, 30) }),
        NotificationsActions.closedAbsenceReport({ from: 10, to: 20 }),
      );
      expect(state.report.pending).toEqual(report(20, 30));
    });
  });

  it('forgets everything of the previous player when another one is entered', () => {
    const state = reduce(
      BankingActions.receivedProjection({
        projection: projection({ lastSeq: 3, unread: 2, autoPause: DEFAULTS }),
      }),
      NotificationsActions.receivedAbsenceReport({ report: report(10, 20) }),
      SessionActions.enterGame({ profile: { id: 'p-b' } as PlayerProfile }),
    );
    expect(state).toEqual(initialNotificationsState);
  });
});
