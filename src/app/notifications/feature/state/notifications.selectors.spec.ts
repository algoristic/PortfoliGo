import { emptyMonthlyValues } from '@app/banking/domain/monthly-values-logic';
import { AccountEntry } from '@app/banking/feature/state/banking.model';
import { AbsenceReport } from '@app/notifications/domain/models/absence-report.model';
import {
  AUTO_PAUSE_CODES,
  AutoPauseCode,
} from '@app/notifications/domain/models/notification.model';
import { Bank } from '@app/world/domain/models/bank.model';

import { NOTIFICATION_PAGE_SIZE } from './notifications.model';
import { initialCenterState, initialNotificationsState } from './notifications.reducer';
import {
  selectAccountNames,
  selectAutoPause,
  selectCenterWindow,
  selectReportToShow,
} from './notifications.selectors';

const DEFAULTS = Object.fromEntries(
  AUTO_PAUSE_CODES.map((code) => [code, code === 'overdraft-limit-exceeded']),
) as Record<AutoPauseCode, boolean>;

const REPORT: AbsenceReport = {
  from: 0,
  to: 60,
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

describe('notifications selectors', () => {
  describe('selectAutoPause', () => {
    it('shows a switch last sent over the value of the projection', () => {
      expect(
        selectAutoPause.projector({
          ...initialNotificationsState,
          autoPause: DEFAULTS,
          requestedAutoPause: { 'overdraft-limit-exceeded': false },
        }),
      ).toEqual({ ...DEFAULTS, 'overdraft-limit-exceeded': false });
    });

    it('is null until the first projection', () => {
      expect(
        selectAutoPause.projector({
          ...initialNotificationsState,
          requestedAutoPause: { 'account-uncovered': true },
        }),
      ).toBeNull();
    });
  });

  describe('selectCenterWindow', () => {
    it.each([
      // offset, total, entries → first, last, newer, older
      [0, 0, 0, 0, 0, false, false],
      [0, 3, 3, 1, 3, false, false],
      [
        0,
        NOTIFICATION_PAGE_SIZE + 1,
        NOTIFICATION_PAGE_SIZE,
        1,
        NOTIFICATION_PAGE_SIZE,
        false,
        true,
      ],
      [
        NOTIFICATION_PAGE_SIZE,
        NOTIFICATION_PAGE_SIZE + 1,
        1,
        NOTIFICATION_PAGE_SIZE + 1,
        NOTIFICATION_PAGE_SIZE + 1,
        true,
        false,
      ],
    ])(
      'places offset %d of %d matches with %d entries',
      (offset, total, count, first, last, hasNewer, hasOlder) => {
        const entries = Array.from({ length: count }, (_, i) => ({
          seq: i + 1,
          tick: 0,
          code: 'month-closed' as const,
          params: { year: 2030, month: 4, values: emptyMonthlyValues() },
          read: true,
        }));
        expect(
          selectCenterWindow.projector({ ...initialCenterState, offset, total, entries }),
        ).toMatchObject({ first, last, hasNewer, hasOlder });
      },
    );

    it('has no older page before the first reply', () => {
      expect(selectCenterWindow.projector(initialCenterState)).toMatchObject({
        total: null,
        hasNewer: false,
        hasOlder: false,
      });
    });
  });

  describe('selectReportToShow', () => {
    it('shows the report only while the game is ready, never above the session overlay', () => {
      expect(selectReportToShow.projector(REPORT, 'ready')).toBe(REPORT);
      expect(selectReportToShow.projector(REPORT, 'catching-up')).toBeNull();
      expect(selectReportToShow.projector(REPORT, 'loading')).toBeNull();
      expect(selectReportToShow.projector(null, 'ready')).toBeNull();
    });
  });

  describe('selectAccountNames', () => {
    it('names accounts by kind, number and bank, without the bank until it is known', () => {
      const bank = { id: 'b1', name: 'Hansebank' } as Bank;
      const accounts = [
        { id: 'acc-1', kind: 'current', number: '0000000001', bank },
        { id: 'acc-2', kind: 'savings', number: '0000000002', bank: null },
      ] as unknown as AccountEntry[];
      expect([...selectAccountNames.projector(accounts)]).toEqual([
        ['acc-1', 'Girokonto 0000000001 · Hansebank'],
        ['acc-2', 'Tagesgeld 0000000002'],
      ]);
    });
  });
});
